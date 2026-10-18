#pragma once

#include "ai.hpp"
#include "board.hpp"
#include "utils.hpp"
#include <cstdint>
#include <functional>
#include <memory>
#include <string>

enum class SearchState : std::uint8_t { Ready, Cancelled, Error };

struct ComputerSearch {
  SearchState state{SearchState::Ready};
  int request_id{};
  SearchResult result;
  std::string error;
};

class AiController {
public:
  AiController();
  ~AiController();
  AiController(const AiController &) = delete;
  AiController &operator=(const AiController &) = delete;
  AiController(AiController &&) = delete;
  AiController &operator=(AiController &&) = delete;

  void start(const Board &board, DiscColor color, Difficulty difficulty,
             int request_id, std::function<void(ComputerSearch)> complete);
  void cancel();
  void shutdown();
  bool stopped() const;

private:
  class WorkerContext;
  std::shared_ptr<WorkerContext> worker_context_;
  bool started_{};
};
