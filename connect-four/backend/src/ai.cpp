#include "ai.hpp"
#include "board.hpp"
#include "utils.hpp"
#include <algorithm>
#include <array>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <functional>
#include <limits>
#include <optional>
#include <stdexcept>
#include <utility>
#include <vector>

namespace {
constexpr int kWin = 1000000;
constexpr int kCenterWeight = 6;
constexpr std::array<int, 7> kMoveOrder{3, 2, 4, 1, 5, 0, 6};
constexpr std::array<int, 5> kWeights{0, 1, 10, 100, kWin};
constexpr std::array<std::pair<int, int>, 4> kDirections{
    {{0, 1}, {1, 0}, {1, 1}, {1, -1}}};
constexpr SearchLimits kEasyLimits{.max_depth = 2,
                                   .budget = std::chrono::milliseconds{50}};
constexpr SearchLimits kMediumLimits{.max_depth = 3,
                                     .budget = std::chrono::milliseconds{200}};
constexpr SearchLimits kHardLimits{.max_depth = 8,
                                   .budget = std::chrono::milliseconds{750}};

DiscColor opponent(DiscColor color) {
  return color == DiscColor::Red ? DiscColor::Yellow : DiscColor::Red;
}

Row place_checked(Board &board, Column column, DiscColor color) {
  const auto row = board.place_disc(column, color);
  if (!row) {
    throw std::logic_error("Search attempted an unavailable column");
  }
  return *row;
}

bool has_win(const Board &board) {
  for (int row = 0; row < board.rows_count(); ++row) {
    for (int col = 0; col < board.cols_count(); ++col) {
      const auto cell = board.get_cell(Row{row}, Column{col});
      if (cell && board.check_win(Row{row}, Column{col}, *cell)) {
        return true;
      }
    }
  }
  return false;
}

int window_score(const Board &board, DiscColor color, int row, int col,
                 int row_step, int column_step) {
  if (row + (3 * row_step) >= board.rows_count() ||
      col + (3 * column_step) < 0 ||
      col + (3 * column_step) >= board.cols_count()) {
    return 0;
  }
  int own = 0;
  int other = 0;
  for (int cell = 0; cell < 4; ++cell) {
    const auto disc = board.get_cell(Row{row + (cell * row_step)},
                                     Column{col + (cell * column_step)});
    if (disc) {
      *disc == color ? ++own : ++other;
    }
  }
  if (other == 0) {
    return kWeights.at(own);
  }
  return own == 0 ? -kWeights.at(other) : 0;
}

int evaluate(const Board &board, DiscColor color) {
  int score = 0;
  for (int row = 0; row < board.rows_count(); ++row) {
    const auto center = board.get_cell(Row{row}, Column{3});
    if (center) {
      score += *center == color ? kCenterWeight : -kCenterWeight;
    }
    for (int col = 0; col < board.cols_count(); ++col) {
      for (const auto &[row_step, column_step] : kDirections) {
        score += window_score(board, color, row, col, row_step, column_step);
      }
    }
  }
  return score;
}

class Search {
public:
  Search(const std::function<bool()> &cancelled,
         const std::function<std::chrono::steady_clock::time_point()> &now,
         SearchLimits limits)
      : cancelled_(cancelled), now_(now), deadline_(now() + limits.budget) {}

  int score(const Board &board, DiscColor color, int depth, int alpha, int beta,
            int ply) {
    std::vector<Frame> frames;
    frames.reserve(std::min(depth, board.rows_count() * board.cols_count()) +
                   1);
    frames.push_back({.board = board,
                      .color = color,
                      .depth = depth,
                      .alpha = alpha,
                      .beta = beta,
                      .ply = ply});
    while (!frames.empty()) {
      auto &frame = frames.back();
      if (!enter(frame)) {
        return 0;
      }
      if (const auto value = terminal_score(frame)) {
        frames.pop_back();
        if (frames.empty()) {
          return *value;
        }
        accept(frames.back(), -*value);
        continue;
      }
      const Column column{kMoveOrder.at(frame.next_move++)};
      if (!frame.board.can_place(column)) {
        continue;
      }
      Board next = frame.board;
      const auto row = place_checked(next, column, frame.color);
      if (next.check_win(row, column, frame.color)) {
        accept(frame, kWin - frame.ply);
        continue;
      }
      frames.push_back({.board = std::move(next),
                        .color = opponent(frame.color),
                        .depth = frame.depth - 1,
                        .alpha = -frame.beta,
                        .beta = -frame.alpha,
                        .ply = frame.ply + 1});
    }
    throw std::logic_error("Search exhausted its stack without a result");
  }

  bool interrupted() const { return interrupted_; }
  bool was_cancelled() const { return was_cancelled_; }
  std::uint64_t nodes() const { return nodes_; }

private:
  struct Frame {
    Board board;
    DiscColor color;
    int depth;
    int alpha;
    int beta;
    int ply;
    int best{-kWin * 2};
    std::size_t next_move{};
    bool entered{};
  };

  bool enter(Frame &frame) {
    if (frame.entered) {
      return true;
    }
    frame.entered = true;
    ++nodes_;
    was_cancelled_ = cancelled_();
    interrupted_ = was_cancelled_ || now_() >= deadline_;
    return !interrupted_;
  }

  static std::optional<int> terminal_score(const Frame &frame) {
    if (frame.board.is_full()) {
      return 0;
    }
    if (frame.depth == 0) {
      return evaluate(frame.board, frame.color);
    }
    if (frame.alpha >= frame.beta || frame.next_move == kMoveOrder.size()) {
      return frame.best;
    }
    return std::nullopt;
  }

  static void accept(Frame &frame, int value) {
    frame.best = std::max(frame.best, value);
    frame.alpha = std::max(frame.alpha, value);
  }

  std::reference_wrapper<const std::function<bool()>> cancelled_;
  std::reference_wrapper<
      const std::function<std::chrono::steady_clock::time_point()>>
      now_;
  std::chrono::steady_clock::time_point deadline_;
  std::uint64_t nodes_{};
  bool interrupted_{};
  bool was_cancelled_{};
};

bool has_winning_drop(const Board &board, DiscColor color) {
  for (const int col : kMoveOrder) {
    if (!board.can_place(Column{col})) {
      continue;
    }
    Board next = board;
    const auto row = place_checked(next, Column{col}, color);
    if (next.check_win(row, Column{col}, color)) {
      return true;
    }
  }
  return false;
}

struct RootMoves {
  std::vector<int> legal;
  std::vector<int> safe;
  std::optional<Column> win;
  bool cancelled{};
};

RootMoves root_moves(const Board &board, DiscColor color,
                     const std::function<bool()> &cancelled) {
  RootMoves moves;
  for (const int col : kMoveOrder) {
    if (cancelled()) {
      moves.cancelled = true;
      return moves;
    }
    if (!board.can_place(Column{col})) {
      continue;
    }
    moves.legal.push_back(col);
    Board next = board;
    const auto row = place_checked(next, Column{col}, color);
    if (next.check_win(row, Column{col}, color)) {
      moves.win = Column{col};
      return moves;
    }
    if (!has_winning_drop(next, opponent(color))) {
      moves.safe.push_back(col);
    }
  }
  return moves;
}

SearchResult initial_choice(const Board &board, DiscColor color,
                            const std::vector<int> &candidates) {
  SearchResult result{.completed_depth = 1};
  int best = std::numeric_limits<int>::min();
  for (const int col : candidates) {
    Board next = board;
    place_checked(next, Column{col}, color);
    const int value = next.is_full() ? 0 : evaluate(next, color);
    if (value > best) {
      best = value;
      result.column = Column{col};
    }
  }
  return result;
}

SearchResult refine(const Board &board, DiscColor color,
                    const std::vector<int> &candidates, SearchLimits limits,
                    Search &search, SearchResult result) {
  for (int depth = 2; depth <= limits.max_depth; ++depth) {
    int iteration_best = -kWin * 2;
    auto iteration_column = result.column;
    for (const int col : candidates) {
      Board next = board;
      place_checked(next, Column{col}, color);
      const int value = -search.score(next, opponent(color), depth - 1,
                                      -kWin * 2, -iteration_best, 1);
      if (search.interrupted()) {
        result.nodes = search.nodes();
        result.cancelled = search.was_cancelled();
        return result;
      }
      if (value > iteration_best) {
        iteration_best = value;
        iteration_column = Column{col};
      }
    }
    result.column = iteration_column;
    result.completed_depth = depth;
  }
  result.nodes = search.nodes();
  return result;
}
} // namespace

SearchLimits limits_for(Difficulty difficulty) {
  switch (difficulty) {
  case Difficulty::Easy:
    return kEasyLimits;
  case Difficulty::Medium:
    return kMediumLimits;
  case Difficulty::Hard:
    return kHardLimits;
  }
  throw std::invalid_argument("Unknown computer difficulty");
}

SearchResult
choose_move(const Board &board, DiscColor color, SearchLimits limits,
            const std::function<bool()> &cancelled,
            const std::function<std::chrono::steady_clock::time_point()> &now) {
  if (limits.max_depth < 1 || limits.budget.count() < 0) {
    throw std::invalid_argument("Invalid computer search limits");
  }
  if (cancelled()) {
    return {.cancelled = true};
  }
  if (board.is_full() || has_win(board)) {
    return {};
  }
  Search search(cancelled, now, limits);
  const auto moves = root_moves(board, color, cancelled);
  if (moves.cancelled) {
    return {.cancelled = true};
  }
  if (moves.win) {
    return {.column = moves.win, .completed_depth = 1, .nodes = 1};
  }
  const auto &candidates = moves.safe.empty() ? moves.legal : moves.safe;
  auto result = refine(board, color, candidates, limits, search,
                       initial_choice(board, color, candidates));
  result.cancelled = result.cancelled || cancelled();
  return result;
}
