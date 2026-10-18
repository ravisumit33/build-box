#include "ai_controller.hpp"
#include "ai.hpp"
#include "board.hpp"
#include "utils.hpp"
#include <atomic>
#include <condition_variable>
#include <exception>
#include <functional>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <system_error>
#include <thread>
#include <utility>

class AiController::WorkerContext {
public:
  WorkerContext() = default;
  WorkerContext(const WorkerContext &) = delete;
  WorkerContext &operator=(const WorkerContext &) = delete;
  WorkerContext(WorkerContext &&) = delete;
  WorkerContext &operator=(WorkerContext &&) = delete;

  ~WorkerContext() = default;

private:
  friend class AiController;

  struct Job {
    Board board;
    DiscColor color;
    SearchLimits limits;
    unsigned generation;
    int request_id;
    std::function<void(ComputerSearch)> complete;
  };

  void run() {
    while (true) {
      std::unique_ptr<Job> job;
      {
        std::unique_lock lock(mutex_);
        wake_.wait(lock, [this] { return closing_.load() || pending_; });
        if (closing_.load()) {
          break;
        }
        job = std::move(pending_);
      }
      ComputerSearch completion{.request_id = job->request_id};
      try {
        completion.result =
            choose_move(job->board, job->color, job->limits, [&] {
              return closing_.load() || generation_.load() != job->generation;
            });
        completion.state = completion.result.cancelled ? SearchState::Cancelled
                                                       : SearchState::Ready;
      } catch (const std::exception &error) {
        completion.state = SearchState::Error;
        completion.error = error.what();
      } catch (...) {
        completion.state = SearchState::Error;
        completion.error = "Unknown computer search failure.";
      }
      job->complete(std::move(completion));
    }
    stopped_.store(true);
  }

  std::mutex mutex_;
  std::condition_variable wake_;
  std::unique_ptr<Job> pending_;
  std::atomic<unsigned> generation_;
  std::atomic<bool> closing_;
  std::atomic<bool> stopped_{true};
};

AiController::AiController()
    : worker_context_(std::make_shared<WorkerContext>()) {}

AiController::~AiController() { shutdown(); }

void AiController::start(const Board &board, DiscColor color,
                         Difficulty difficulty, int request_id,
                         std::function<void(ComputerSearch)> complete) {
  if (worker_context_->closing_.load()) {
    throw std::logic_error("The computer search controller has shut down");
  }
  if (!complete) {
    throw std::invalid_argument(
        "Computer search requires a completion callback");
  }
  const auto limits = limits_for(difficulty);
  cancel();
  if (!started_) {
    worker_context_->stopped_.store(false);
    try {
      std::thread([context = worker_context_] { context->run(); }).detach();
    } catch (const std::system_error &) {
      worker_context_->stopped_.store(true);
      throw;
    }
    started_ = true;
  }
  auto job = std::make_unique<WorkerContext::Job>(
      WorkerContext::Job{.board = board,
                         .color = color,
                         .limits = limits,
                         .generation = worker_context_->generation_.load(),
                         .request_id = request_id,
                         .complete = std::move(complete)});
  {
    const std::lock_guard lock(worker_context_->mutex_);
    worker_context_->pending_ = std::move(job);
  }
  worker_context_->wake_.notify_one();
}

void AiController::cancel() {
  worker_context_->generation_.fetch_add(1);
  const std::lock_guard lock(worker_context_->mutex_);
  worker_context_->pending_.reset();
}

void AiController::shutdown() {
  cancel();
  {
    const std::lock_guard lock(worker_context_->mutex_);
    worker_context_->closing_.store(true);
  }
  worker_context_->wake_.notify_one();
}

bool AiController::stopped() const { return worker_context_->stopped_.load(); }
