#include "board.hpp"
#include "game.hpp"
#include "game_session.hpp"
#include "player.hpp"
#include "utils.hpp"
#include <array>
#include <exception>
#include <iostream>
#include <stdexcept>
#include <string>

namespace {
constexpr int kRows = 6;
constexpr int kColumns = 7;
constexpr int kBottomRow = kRows - 1;
constexpr std::array kHorizontalWin{0, 6, 1, 6, 2, 5, 3};
constexpr std::array kVerticalWin{0, 1, 0, 1, 0, 1, 0};
constexpr std::array kDraw{0, 2, 1, 2, 5, 4, 5, 4, 0, 4, 6, 1, 5, 0,
                           2, 0, 0, 3, 3, 5, 2, 3, 5, 3, 0, 5, 2, 3,
                           4, 2, 6, 4, 1, 4, 6, 6, 6, 6, 3, 1, 1, 1};

void require(bool condition, const std::string &message) {
  if (!condition) {
    throw std::runtime_error(message);
  }
}

void test_board() {
  Board board;
  require(board.rows_count() == kRows && board.cols_count() == kColumns,
          "Board dimensions");
  require(!board.place_disc(Column{-1}, DiscColor::Red),
          "Reject negative column");
  require(!board.place_disc(Column{kColumns}, DiscColor::Red),
          "Reject outside column");
  for (int row = kBottomRow; row >= 0; --row) {
    require(board.place_disc(Column{0}, DiscColor::Red) == Row{row},
            "Disc falls to lowest empty cell");
  }
  require(!board.can_place(Column{0}), "Full column cannot accept a disc");
  require(!board.place_disc(Column{0}, DiscColor::Yellow),
          "Reject full column");
  require(!board.is_full(), "One full column is not a full board");

  Board diagonal;
  Board falling;
  for (int col = 0; col < 4; ++col) {
    for (int filler = 0; filler < col; ++filler) {
      diagonal.place_disc(Column{col}, DiscColor::Yellow);
    }
    const auto row = diagonal.place_disc(Column{col}, DiscColor::Red);
    if (!row) {
      throw std::runtime_error("Could not construct diagonal fixture");
    }
    if (col == 3) {
      require(diagonal.check_win(*row, Column{col}, DiscColor::Red),
              "Detect rising diagonal");
    }
    for (int filler = 0; filler < 3 - col; ++filler) {
      falling.place_disc(Column{col}, DiscColor::Yellow);
    }
    falling.place_disc(Column{col}, DiscColor::Red);
  }
  require(falling.check_win(Row{kBottomRow}, Column{3}, DiscColor::Red),
          "Detect falling diagonal");
  Board crossing;
  for (int col = 0; col <= 4; ++col) {
    crossing.place_disc(Column{col}, DiscColor::Red);
  }
  for (int disc = 0; disc < 3; ++disc) {
    crossing.place_disc(Column{2}, DiscColor::Red);
  }
  const auto lines =
      crossing.get_winning_lines(Row{kBottomRow}, Column{2}, DiscColor::Red);
  require(lines.size() == 2, "Preserve intersecting winning lines");
  require(lines[0].size() >= 4 && lines[1].size() >= 4, "Winning line lengths");
}

void test_session() {
  GameSession session;
  require(session.get_snapshot().current_player_id == PlayerId{1},
          "Red starts");
  require(!session.make_move(kColumns), "Invalid move is rejected");
  require(session.get_snapshot().current_player_id == PlayerId{1},
          "Invalid move preserves turn");
  for (const int column : kHorizontalWin) {
    require(session.make_move(column), "Accept horizontal win sequence");
  }
  auto snapshot = session.get_snapshot();
  require(snapshot.state == GameState::Won && snapshot.winner_id == PlayerId{1},
          "Red wins horizontally");
  require(!session.make_move(4), "Reject a move after winning");
  require(snapshot.winning_lines.size() == 1, "Expose winning geometry");
  session.reset();
  snapshot = session.get_snapshot();
  require(snapshot.state == GameState::InProgress && !snapshot.winner_id &&
              snapshot.winning_lines.empty() && !snapshot.board[kBottomRow][0],
          "Reset clears game");
  for (const int column : kVerticalWin) {
    require(session.make_move(column), "Accept vertical win sequence");
  }
  require(session.get_snapshot().state == GameState::Won,
          "Detect vertical win");
  session.reset();
  for (const int column : kDraw) {
    require(session.make_move(column), "Accept draw sequence");
  }
  require(session.get_snapshot().state == GameState::Draw, "Detect draw");
  require(!session.make_move(0), "Reject moves after draw");
}
} // namespace

int main() {
  try {
    test_board();
    test_session();
    std::cout << "Engine tests passed\n";
    return 0;
  } catch (const std::exception &error) {
    std::cerr << error.what() << '\n';
    return 1;
  }
}
