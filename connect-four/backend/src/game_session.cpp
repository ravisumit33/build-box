#include "game_session.hpp"
#include "ai.hpp"
#include "ai_controller.hpp"
#include "board.hpp"
#include "game.hpp"
#include "player.hpp"
#include "utils.hpp"
#include <functional>
#include <stdexcept>
#include <utility>

namespace {
constexpr PlayerId kPlayer1Id{1};
constexpr PlayerId kPlayer2Id{2};

PlayerRegistry create_player_registry() {
  PlayerRegistry registry;
  registry.add_player(kPlayer1Id, Player{"Alice", DiscColor::Red});
  registry.add_player(kPlayer2Id, Player{"Bob", DiscColor::Yellow});
  return registry;
}
} // namespace

GameSession::GameSession()
    : player_registry_(create_player_registry()),
      game_(player_registry_, kPlayer1Id, kPlayer2Id) {}

bool GameSession::make_move(int column) {
  const bool moved =
      game_.make_move(game_.get_current_player_id(), Column{column});
  if (moved) {
    computer_.cancel();
  }
  return moved;
}

GameSnapshot GameSession::get_snapshot() const {
  const auto &board = game_.get_board();
  GameSnapshot snapshot{.board = {},
                        .current_player_id = game_.get_current_player_id(),
                        .state = game_.get_game_state(),
                        .winner_id = game_.get_winner_id(),
                        .winning_lines = game_.get_winning_lines()};
  snapshot.board.reserve(board.rows_count());

  for (int row = 0; row < board.rows_count(); ++row) {
    auto &cells = snapshot.board.emplace_back();
    cells.reserve(board.cols_count());
    for (int column = 0; column < board.cols_count(); ++column) {
      cells.push_back(board.get_cell(Row{row}, Column{column}));
    }
  }

  return snapshot;
}

void GameSession::reset() {
  computer_.cancel();
  game_ = Game{player_registry_, kPlayer1Id, kPlayer2Id};
}

void GameSession::start_computer_search(
    Difficulty difficulty, int request_id,
    std::function<void(ComputerSearch)> complete) {
  if (game_.get_game_state() != GameState::InProgress) {
    throw std::logic_error("Cannot search a finished game");
  }
  const auto color = game_.get_current_player_id() == kPlayer1Id
                         ? DiscColor::Red
                         : DiscColor::Yellow;
  computer_.start(game_.get_board(), color, difficulty, request_id,
                  std::move(complete));
}

void GameSession::cancel_computer_search() { computer_.cancel(); }
