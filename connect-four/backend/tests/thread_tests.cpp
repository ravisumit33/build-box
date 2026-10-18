#include "ai.hpp"
#include "ai_controller.hpp"
#include "board.hpp"
#include "utils.hpp"
#include <atomic>
#include <chrono>
#include <exception>
#include <future>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <thread>
#include <utility>

namespace {
constexpr int kRestartCount = 40;
constexpr int kCurrentRequest = 100;
constexpr int kShutdownRequest = 101;
constexpr int kDisposalCount = 20;
constexpr int kWakeCount = 20;

template <typename Predicate> void wait_for(Predicate predicate) {
  const auto deadline =
      std::chrono::steady_clock::now() + std::chrono::seconds{3};
  while (!predicate()) {
    if (std::chrono::steady_clock::now() >= deadline) {
      throw std::runtime_error("Timed out waiting for background thread");
    }
    std::this_thread::sleep_for(std::chrono::milliseconds{1});
  }
}

void require(bool condition, const char *message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}

struct CompletedSearch {
  ComputerSearch search;
  std::thread::id worker;
};

std::future<CompletedSearch> start_search(AiController &controller,
                                          const Board &board, DiscColor color,
                                          Difficulty difficulty,
                                          int request_id) {
  const auto completed = std::make_shared<std::promise<CompletedSearch>>();
  auto notification = completed->get_future();
  controller.start(
      board, color, difficulty, request_id, [completed](ComputerSearch search) {
        completed->set_value({.search = std::move(search),
                              .worker = std::this_thread::get_id()});
      });
  return notification;
}

CompletedSearch await_completion(std::future<CompletedSearch> notification) {
  require(notification.wait_for(std::chrono::seconds{3}) ==
              std::future_status::ready,
          "Search delivers its completion payload without polling");
  return notification.get();
}

void test_completion_events() {
  const auto completed = std::make_shared<std::promise<CompletedSearch>>();
  auto notification = completed->get_future();
  const auto count = std::make_shared<std::atomic<int>>();
  AiController controller;
  controller.start(Board{}, DiscColor::Red, Difficulty::Easy, kCurrentRequest,
                   [completed, count](ComputerSearch search) {
                     ++*count;
                     completed->set_value(
                         {.search = std::move(search),
                          .worker = std::this_thread::get_id()});
                   });
  const auto completion = await_completion(std::move(notification));
  require(completion.worker != std::this_thread::get_id(),
          "Completion payload is delivered on the worker thread");
  require(completion.search.state == SearchState::Ready &&
              completion.search.request_id == kCurrentRequest &&
              completion.search.result.column == Column{3} &&
              completion.search.result.completed_depth > 0 &&
              completion.search.error.empty(),
          "The callback receives the complete result, not just readiness");
  controller.shutdown();
  wait_for([&] { return controller.stopped(); });
  require(count->load() == 1, "A search delivers its completion only once");
}

void test_callback_is_required() {
  AiController controller;
  bool rejected{};
  try {
    controller.start(Board{}, DiscColor::Red, Difficulty::Easy, kCurrentRequest,
                     {});
  } catch (const std::invalid_argument &) {
    rejected = true;
  }
  require(rejected && controller.stopped(),
          "An empty completion callback is rejected before starting a worker");
  const auto completion = await_completion(start_search(
      controller, Board{}, DiscColor::Red, Difficulty::Easy, kCurrentRequest));
  require(completion.search.state == SearchState::Ready,
          "A rejected callback does not prevent subsequent searches");
}

void test_pending_cancellation() {
  AiController controller;
  const auto entered = std::make_shared<std::promise<void>>();
  auto notification = entered->get_future();
  std::promise<void> resume;
  auto resumed = resume.get_future().share();
  controller.start(Board{}, DiscColor::Red, Difficulty::Easy, kCurrentRequest,
                   [entered, resumed](const ComputerSearch &) {
                     entered->set_value();
                     resumed.wait();
                   });
  require(notification.wait_for(std::chrono::seconds{3}) ==
              std::future_status::ready,
          "The worker reaches the first completion callback");
  const auto count = std::make_shared<std::atomic<int>>();
  controller.start(Board{}, DiscColor::Red, Difficulty::Hard, kShutdownRequest,
                   [count](const ComputerSearch &) { ++*count; });
  controller.cancel();
  resume.set_value();
  const auto completion =
      await_completion(start_search(controller, Board{}, DiscColor::Yellow,
                                    Difficulty::Easy, kCurrentRequest));
  require(completion.search.state == SearchState::Ready && count->load() == 0,
          "Cancelling queued work discards its callback without delivery");
  controller.shutdown();
  wait_for([&] { return controller.stopped(); });
}
} // namespace

int main() {
  try {
    test_completion_events();
    test_callback_is_required();
    test_pending_cancellation();
    AiController controller;
    Board const board;
    for (int request = 1; request <= kRestartCount; ++request) {
      start_search(controller, board, DiscColor::Red, Difficulty::Hard,
                   request);
      controller.cancel();
    }
    auto result =
        await_completion(start_search(controller, board, DiscColor::Yellow,
                                      Difficulty::Easy, kCurrentRequest))
            .search;
    require(result.state == SearchState::Ready &&
                result.request_id == kCurrentRequest &&
                result.result.column == Column{3},
            "Only the newest request completes");
    Board winning_board;
    for (int disc = 0; disc < 3; ++disc) {
      winning_board.place_disc(Column{0}, DiscColor::Red);
    }
    for (int replacement = 0; replacement < kRestartCount; ++replacement) {
      start_search(controller, winning_board, DiscColor::Red, Difficulty::Hard,
                   kCurrentRequest);
      result =
          await_completion(start_search(controller, board, DiscColor::Yellow,
                                        Difficulty::Easy, kCurrentRequest))
              .search;
      require(result.state == SearchState::Ready &&
                  result.request_id == kCurrentRequest &&
                  result.result.column == Column{3},
              "Reusing a request ID cannot return the previous board's move");
    }
    for (int request = 0; request < kWakeCount; ++request) {
      std::this_thread::sleep_for(std::chrono::milliseconds{1});
      result = await_completion(start_search(controller, board, DiscColor::Red,
                                             Difficulty::Easy, request))
                   .search;
      require(result.state == SearchState::Ready &&
                  result.request_id == request &&
                  result.result.column == Column{3},
              "Idle worker wakes for each new request");
    }
    for (int request = 0; request < kRestartCount; ++request) {
      start_search(controller, board, DiscColor::Red, Difficulty::Hard,
                   request);
    }
    result = await_completion(start_search(controller, board, DiscColor::Yellow,
                                           Difficulty::Easy, kCurrentRequest))
                 .search;
    require(result.state == SearchState::Ready &&
                result.request_id == kCurrentRequest,
            "New starts replace pending and running requests");
    start_search(controller, board, DiscColor::Red, Difficulty::Hard,
                 kShutdownRequest);
    controller.shutdown();
    wait_for([&] { return controller.stopped(); });
    bool restart_rejected{};
    try {
      start_search(controller, board, DiscColor::Red, Difficulty::Easy,
                   kCurrentRequest);
    } catch (const std::logic_error &) {
      restart_rejected = true;
    }
    require(restart_rejected, "Shutdown controller cannot restart");
    {
      AiController idle;
      await_completion(start_search(idle, board, DiscColor::Red,
                                    Difficulty::Easy, kCurrentRequest));
      std::this_thread::sleep_for(std::chrono::milliseconds{1});
      idle.shutdown();
      wait_for([&] { return idle.stopped(); });
    }
    {
      AiController unused;
      unused.shutdown();
      require(unused.stopped(), "Shutdown before the worker starts");
    }
    for (int iteration = 0; iteration < kDisposalCount; ++iteration) {
      AiController temporary;
      start_search(temporary, board, DiscColor::Red, Difficulty::Hard,
                   iteration);
    }
    std::cout << "Thread tests passed\n";
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
