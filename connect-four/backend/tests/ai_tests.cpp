#include "ai.hpp"
#include "board.hpp"
#include "utils.hpp"
#include <chrono>
#include <exception>
#include <iostream>
#include <stdexcept>
#include <string>
#include <string_view>

namespace {
constexpr int kThreatColumn = 6;
constexpr int kPartialSearchChecks = 50;
constexpr int kCancellationChecks = 20;
constexpr int kEasyDepth = 2;
constexpr int kMediumDepth = 3;
constexpr int kHardDepth = 8;
constexpr int kEasyTrapPlies = 3;
constexpr int kMediumTrapPlies = 5;
constexpr Column kHardDefenseColumn{5};
constexpr std::chrono::milliseconds kEasyBudget{50};
constexpr std::chrono::milliseconds kMediumBudget{200};
constexpr std::chrono::milliseconds kHardBudget{750};

void require(bool condition, const std::string &message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}

DiscColor opponent(DiscColor color) {
  return color == DiscColor::Red ? DiscColor::Yellow : DiscColor::Red;
}

Board position_from_moves(std::string_view columns, DiscColor first) {
  Board board;
  auto color = first;
  for (const char digit : columns) {
    const Column column{digit - '0'};
    const auto row = board.place_disc(column, color);
    require(row && !board.check_win(*row, column, color),
            "Difficulty fixtures contain only legal, non-terminal moves");
    color = opponent(color);
  }
  return board;
}

template <int plies>
bool can_force_win(const Board &board, DiscColor color, DiscColor attacker) {
  if constexpr (plies == 0) {
    return false;
  } else {
    bool legal{};
    for (int column = 0; column < board.cols_count(); ++column) {
      Board next = board;
      const auto row = next.place_disc(Column{column}, color);
      if (!row) {
        continue;
      }
      legal = true;
      const bool wins =
          next.check_win(*row, Column{column}, color)
              ? color == attacker
              : can_force_win<plies - 1>(next, opponent(color), attacker);
      if (color == attacker && wins) {
        return true;
      }
      if (color != attacker && !wins) {
        return false;
      }
    }
    return color != attacker && legal;
  }
}

template <int plies>
bool opponent_can_force_win(Board board, DiscColor color,
                            const SearchResult &search) {
  if (!search.column || !board.can_place(*search.column)) {
    throw std::runtime_error("Difficulty search must return a legal move");
  }
  const auto row = board.place_disc(*search.column, color);
  if (!row) {
    throw std::runtime_error("Could not apply the difficulty search move");
  }
  if (board.check_win(*row, *search.column, color)) {
    return false;
  }
  return can_force_win<plies>(board, opponent(color), opponent(color));
}

void test_difficulty_planning() {
  const auto clock = [] { return std::chrono::steady_clock::time_point{}; };
  for (const auto color : {DiscColor::Red, DiscColor::Yellow}) {
    const auto short_setup =
        position_from_moves("33124532214421223433445", opponent(color));
    const auto easy = choose_move(
        short_setup, color, limits_for(Difficulty::Easy), [] { return false; },
        clock);
    const auto medium = choose_move(
        short_setup, color, limits_for(Difficulty::Medium),
        [] { return false; }, clock);
    require(
        easy.completed_depth == kEasyDepth && easy.nodes > 0 &&
            opponent_can_force_win<kEasyTrapPlies>(short_setup, color, easy),
        "Easy can still overlook a two-move human combination");
    require(
        medium.completed_depth == kMediumDepth &&
            !opponent_can_force_win<kEasyTrapPlies>(short_setup, color, medium),
        "Medium anticipates a two-move combination that beats Easy");

    const auto long_setup =
        position_from_moves("312224101122115554344425", color);
    const auto planned = choose_move(
        long_setup, color, limits_for(Difficulty::Medium), [] { return false; },
        clock);
    const auto hard = choose_move(
        long_setup, color, limits_for(Difficulty::Hard), [] { return false; },
        clock);
    require(
        !opponent_can_force_win<kEasyTrapPlies>(long_setup, color, planned) &&
            opponent_can_force_win<kMediumTrapPlies>(long_setup, color,
                                                     planned),
        "Medium can miss a longer three-move human combination");
    require(
        hard.column == kHardDefenseColumn &&
            hard.completed_depth == kHardDepth &&
            !opponent_can_force_win<kMediumTrapPlies>(long_setup, color, hard),
        "Hard retains its existing defense against the longer combination");
  }
}

bool human_can_win_easy(std::string_view columns, DiscColor human) {
  Board board;
  bool computer_turn = human == DiscColor::Yellow;
  for (const char digit : columns) {
    if (computer_turn) {
      const auto computer = opponent(human);
      const auto search =
          choose_move(board, computer, limits_for(Difficulty::Easy));
      if (!search.column || !board.can_place(*search.column)) {
        throw std::runtime_error("Easy must play a legal move during a game");
      }
      const auto row = board.place_disc(*search.column, computer);
      if (!row) {
        throw std::runtime_error("Could not apply Easy's move");
      }
      if (board.check_win(*row, *search.column, computer)) {
        return false;
      }
    }
    const Column column{digit - '0'};
    const auto row = board.place_disc(column, human);
    if (!row) {
      throw std::runtime_error("The human's planned move must remain legal");
    }
    if (board.check_win(*row, column, human)) {
      return true;
    }
    computer_turn = true;
  }
  return false;
}

void test_easy_is_winnable() {
  require(
      human_can_win_easy("32334454222", DiscColor::Red),
      "An attentive first player can still beat Easy with planned moves");
  require(human_can_win_easy("3322055255444001", DiscColor::Yellow),
          "Easy is also winnable when the computer starts");
}

void test_easy_defends_simple_openings() {
  for (const auto color : {DiscColor::Red, DiscColor::Yellow}) {
    for (const auto *const moves :
         {"3210", "3456", "0123", "6543", "0000", "6666"}) {
      require(!human_can_win_easy(moves, color),
              std::string{"Easy must stop a basic four-disc opening: "} +
                  moves);
    }
  }
}

void test_tactics() {
  for (const auto color : {DiscColor::Red, DiscColor::Yellow}) {
    const auto other =
        color == DiscColor::Red ? DiscColor::Yellow : DiscColor::Red;
    for (const auto difficulty :
         {Difficulty::Easy, Difficulty::Medium, Difficulty::Hard}) {
      Board winning;
      for (int disc = 0; disc < 3; ++disc) {
        winning.place_disc(Column{0}, color);
        winning.place_disc(Column{1}, other);
      }
      const auto result = choose_move(winning, color, limits_for(difficulty));
      require(result.column == Column{0}, "Take a win before blocking");
      require(!winning.get_cell(Row{2}, Column{0}),
              "Search does not mutate board");

      Board threat;
      for (int disc = 0; disc < 3; ++disc) {
        threat.place_disc(Column{kThreatColumn}, other);
      }
      require(choose_move(threat, color, limits_for(difficulty)).column ==
                  Column{kThreatColumn},
              "Block opponent's immediate win");
    }
  }
  const Board empty;
  require(
      choose_move(empty, DiscColor::Red, limits_for(Difficulty::Easy)).column ==
          Column{3},
      "Prefer center opening");
}

void test_limits_and_cancellation() {
  const Board empty;
  auto cancelled = choose_move(
      empty, DiscColor::Red, limits_for(Difficulty::Hard), [] { return true; });
  require(cancelled.cancelled && !cancelled.column, "Cancel before search");

  int ticks = 0;
  const auto clock = [&ticks] {
    return std::chrono::steady_clock::time_point{} +
           std::chrono::seconds(ticks++);
  };
  const auto limited = choose_move(
      empty, DiscColor::Red,
      {.max_depth = kHardDepth, .budget = std::chrono::milliseconds{1}},
      [] { return false; }, clock);
  require(limited.column && limited.completed_depth == 1,
          "Deadline preserves a fully scored initial move");

  ticks = 0;
  const auto partial = choose_move(
      empty, DiscColor::Red,
      {.max_depth = kHardDepth, .budget = std::chrono::milliseconds{1}},
      [] { return false; },
      [&ticks] {
        return std::chrono::steady_clock::time_point{} +
               std::chrono::seconds(++ticks > kPartialSearchChecks ? 1 : 0);
      });
  const auto completed = choose_move(empty, DiscColor::Red,
                                     {.max_depth = partial.completed_depth,
                                      .budget = std::chrono::seconds{1}});
  require(partial.completed_depth > 1 && partial.completed_depth < kHardDepth &&
              partial.column == completed.column,
          "Interrupted deeper iteration preserves its predecessor's choice");

  int checks = 0;
  cancelled = choose_move(empty, DiscColor::Red, limits_for(Difficulty::Hard),
                          [&checks] { return ++checks > kCancellationChecks; });
  require(cancelled.cancelled, "Observe cancellation during search");
}

void test_terminal_boards() {
  Board full;
  for (int col = 0; col < full.cols_count(); ++col) {
    for (int row = 0; row < full.rows_count(); ++row) {
      full.place_disc(Column{col}, DiscColor::Red);
    }
  }
  require(!choose_move(full, DiscColor::Yellow, limits_for(Difficulty::Easy))
               .column,
          "Full or terminal board has no move");
  Board won;
  for (int disc = 0; disc < 4; ++disc) {
    won.place_disc(Column{0}, DiscColor::Red);
  }
  require(
      !choose_move(won, DiscColor::Yellow, limits_for(Difficulty::Easy)).column,
      "Won non-full board has no move");
  Board full_column;
  for (int disc = 0; disc < full_column.rows_count(); ++disc) {
    full_column.place_disc(Column{0},
                           disc % 2 != 0 ? DiscColor::Red : DiscColor::Yellow);
  }
  for (const auto color : {DiscColor::Red, DiscColor::Yellow}) {
    const auto legal =
        choose_move(full_column, color, limits_for(Difficulty::Easy));
    require(legal.column && full_column.can_place(*legal.column),
            "Never select a full column");
  }
}

void test_difficulty_limits() {
  require(limits_for(Difficulty::Easy).max_depth == kEasyDepth &&
              limits_for(Difficulty::Medium).max_depth == kMediumDepth &&
              limits_for(Difficulty::Hard).max_depth == kHardDepth,
          "Difficulty depth caps");
  require(limits_for(Difficulty::Easy).budget == kEasyBudget &&
              limits_for(Difficulty::Medium).budget == kMediumBudget &&
              limits_for(Difficulty::Hard).budget == kHardBudget,
          "Difficulty compute budgets");
}
} // namespace

int main() {
  try {
    test_easy_defends_simple_openings();
    test_tactics();
    test_difficulty_planning();
    test_easy_is_winnable();
    test_limits_and_cancellation();
    test_terminal_boards();
    test_difficulty_limits();
    std::cout << "AI tests passed\n";
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
