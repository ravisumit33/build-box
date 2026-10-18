#include "game.hpp"
#include "board.hpp"
#include "player.hpp"
#include <optional>
#include <vector>

Game::Game(const PlayerRegistry &player_registry, PlayerId player1,
           PlayerId player2)
    : player_registry_(player_registry), current_player_id_(player1),
      player1_id_(player1), player2_id_(player2),
      state_(GameState::InProgress) {}

bool Game::make_move(PlayerId player_id, Column column) {
  if (state_ != GameState::InProgress) {
    return false;
  }
  if (player_id != get_current_player_id()) {
    return false;
  }
  auto player = player_registry_.get().get_player(player_id);
  if (!player) {
    return false;
  }

  auto optional_row = board_.place_disc(column, player->get_color());
  if (!optional_row) {
    return false;
  }

  Row const row = *optional_row;
  winning_lines_ = board_.get_winning_lines(row, column, player->get_color());
  if (!winning_lines_.empty()) {
    state_ = GameState::Won;
    winner_ = current_player_id_;
  } else if (board_.is_full()) {
    state_ = GameState::Draw;
  } else {
    current_player_id_ =
        (current_player_id_ == player1_id_) ? player2_id_ : player1_id_;
  }

  return true;
}

PlayerId Game::get_current_player_id() const { return current_player_id_; }

GameState Game::get_game_state() const { return state_; }

std::optional<PlayerId> Game::get_winner_id() const { return winner_; }

const std::vector<WinningLine> &Game::get_winning_lines() const {
  return winning_lines_;
}

const Board &Game::get_board() const { return board_; }
