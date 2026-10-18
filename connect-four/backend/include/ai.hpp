#pragma once

#include "board.hpp"
#include "utils.hpp"
#include <chrono>
#include <cstdint>
#include <functional>
#include <optional>

enum class Difficulty : std::uint8_t { Easy, Medium, Hard };

struct SearchLimits {
  int max_depth;
  std::chrono::milliseconds budget;
};

struct SearchResult {
  std::optional<Column> column;
  int completed_depth{};
  std::uint64_t nodes{};
  bool cancelled{};
};

SearchLimits limits_for(Difficulty difficulty);

SearchResult choose_move(
    const Board &board, DiscColor color, SearchLimits limits,
    const std::function<bool()> &cancelled = [] { return false; },
    const std::function<std::chrono::steady_clock::time_point()> &now =
        [] { return std::chrono::steady_clock::now(); });
