#include "ai.hpp"
#include "ai_controller.hpp"
#include "game.hpp"
#include "game_session.hpp"
#include "utils.hpp"
#include <cmath>
#include <emscripten/bind.h>
#include <emscripten/console.h>
#include <emscripten/proxying.h>
#include <emscripten/threading.h>
#include <emscripten/val.h>
#include <exception>
#include <limits>
#include <memory>
#include <stdexcept>
#include <string>
#include <utility>

namespace {
const char *state_name(GameState state) {
  switch (state) {
  case GameState::NotStarted:
    return "not_started";
  case GameState::InProgress:
    return "in_progress";
  case GameState::Won:
    return "won";
  case GameState::Draw:
    return "draw";
  }
  throw std::logic_error("Unknown game state");
}

Difficulty difficulty_from_name(const std::string &difficulty) {
  if (difficulty == "easy") {
    return Difficulty::Easy;
  }
  if (difficulty == "medium") {
    return Difficulty::Medium;
  }
  if (difficulty == "hard") {
    return Difficulty::Hard;
  }
  throw std::invalid_argument("Unknown computer difficulty");
}

const char *state_name(SearchState state) {
  switch (state) {
  case SearchState::Ready:
    return "ready";
  case SearchState::Cancelled:
    return "cancelled";
  case SearchState::Error:
    return "error";
  }
  throw std::logic_error("Unknown computer search state");
}

emscripten::val search_to_js(const ComputerSearch &search) {
  auto result = emscripten::val::object();
  result.set("state", std::string(state_name(search.state)));
  result.set("requestId", search.request_id);
  result.set("column",
             search.result.column
                 ? emscripten::val(std::to_underlying(*search.result.column))
                 : emscripten::val::null());
  result.set("completedDepth", search.result.completed_depth);
  result.set("error", search.error);
  return result;
}

emscripten::val snapshot_to_js(const GameSnapshot &snapshot) {
  auto result = emscripten::val::object();
  auto board = emscripten::val::array();
  for (const auto &cells : snapshot.board) {
    auto row = emscripten::val::array();
    for (const auto &cell : cells) {
      row.call<void>(
          "push",
          cell ? emscripten::val(*cell == DiscColor::Red ? "red" : "yellow")
               : emscripten::val::null());
    }
    board.call<void>("push", row);
  }
  result.set("board", board);
  result.set("currentPlayerId", std::to_underlying(snapshot.current_player_id));
  result.set("state", std::string(state_name(snapshot.state)));
  result.set("winnerId",
             snapshot.winner_id
                 ? emscripten::val(std::to_underlying(*snapshot.winner_id))
                 : emscripten::val::null());
  auto winning_lines = emscripten::val::array();
  for (const auto &line : snapshot.winning_lines) {
    auto cells = emscripten::val::array();
    for (const auto &cell : line) {
      auto position = emscripten::val::object();
      position.set("row", std::to_underlying(cell.row));
      position.set("column", std::to_underlying(cell.column));
      cells.call<void>("push", position);
    }
    winning_lines.call<void>("push", cells);
  }
  result.set("winningLines", winning_lines);
  return result;
}

emscripten::ProxyingQueue &completion_queue() {
  static emscripten::ProxyingQueue queue;
  return queue;
}

class WebGameSession {
public:
  WebGameSession() = default;
  WebGameSession(const WebGameSession &) = delete;
  WebGameSession &operator=(const WebGameSession &) = delete;
  WebGameSession(WebGameSession &&) = delete;
  WebGameSession &operator=(WebGameSession &&) = delete;
  ~WebGameSession() = default;

  bool make_move(double column) {
    if (!std::isfinite(column) || std::trunc(column) != column || column < 0 ||
        column > std::numeric_limits<int>::max()) {
      return false;
    }
    const bool moved = session_.make_move(static_cast<int>(column));
    if (moved) {
      completion_.reset();
    }
    return moved;
  }

  emscripten::val get_snapshot() const {
    return snapshot_to_js(session_.get_snapshot());
  }

  void reset() {
    completion_.reset();
    session_.reset();
  }

  void start_computer_search(const std::string &difficulty, double request_id,
                             emscripten::val callback) {
    if (!std::isfinite(request_id) || std::trunc(request_id) != request_id ||
        request_id < 1 || request_id > std::numeric_limits<int>::max()) {
      throw std::invalid_argument("Invalid computer search request ID");
    }
    if (callback.typeOf().as<std::string>() != "function") {
      throw std::invalid_argument(
          "Computer search requires a completion callback");
    }
    if (completion_queue().queue == nullptr) {
      throw std::runtime_error("Could not create the search completion queue");
    }
    cancel_computer_search();
    completion_ = std::make_shared<Completion>(std::move(callback));
    const auto target = emscripten_main_runtime_thread_id();
    try {
      session_.start_computer_search(
          difficulty_from_name(difficulty), static_cast<int>(request_id),
          [weak = std::weak_ptr<Completion>{completion_},
           target](ComputerSearch search) noexcept {
            try {
              if (!completion_queue().proxyAsync(
                      target, [weak, search = std::move(search)] {
                        if (const auto delivery = weak.lock()) {
                          delivery->deliver(search);
                        }
                      })) {
                emscripten_console_error(
                    "Could not dispatch computer search completion.");
              }
            } catch (const std::exception &error) {
              emscripten_console_error("Computer search dispatch failed.");
              emscripten_console_error(error.what());
            }
          });
    } catch (...) {
      completion_.reset();
      throw;
    }
  }

  void cancel_computer_search() {
    completion_.reset();
    session_.cancel_computer_search();
  }

private:
  class Completion {
  public:
    explicit Completion(emscripten::val callback)
        : callback_(std::move(callback)) {}

    void deliver(const ComputerSearch &search) {
      if (callback_.isUndefined()) {
        return;
      }
      auto complete = std::exchange(callback_, emscripten::val::undefined());
      complete(search_to_js(search));
    }

  private:
    emscripten::val callback_;
  };

  GameSession session_;
  std::shared_ptr<Completion> completion_;
};
} // namespace

EMSCRIPTEN_BINDINGS(connect_four) {
  emscripten::class_<WebGameSession>("GameSession")
      .constructor<>()
      .function("makeMove", &WebGameSession::make_move)
      .function("getSnapshot", &WebGameSession::get_snapshot)
      .function("reset", &WebGameSession::reset)
      .function("startComputerSearch", &WebGameSession::start_computer_search)
      .function("cancelComputerSearch",
                &WebGameSession::cancel_computer_search);
}
