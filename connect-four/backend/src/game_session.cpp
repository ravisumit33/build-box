#include "game_session.hpp"

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
  return game_.make_move(game_.get_current_player_id(), Column{column});
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
  game_ = Game{player_registry_, kPlayer1Id, kPlayer2Id};
}
