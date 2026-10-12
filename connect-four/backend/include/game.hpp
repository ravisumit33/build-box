#pragma once

#include "board.hpp"
#include "player.hpp"
#include <cstdint>
#include <functional>

enum class GameState : std::uint8_t { NotStarted, InProgress, Won, Draw };

class Game {
public:
  Game(const PlayerRegistry &player_registry, PlayerId player1,
       PlayerId player2);

  bool make_move(PlayerId player_id, Column column);

  PlayerId get_current_player_id() const;

  GameState get_game_state() const;

  std::optional<PlayerId> get_winner_id() const;

  const std::vector<WinningLine> &get_winning_lines() const;

  const Board &get_board() const;

private:
  Board board_;
  std::reference_wrapper<const PlayerRegistry> player_registry_;
  PlayerId current_player_id_, player1_id_, player2_id_;
  std::optional<PlayerId> winner_;
  std::vector<WinningLine> winning_lines_;
  GameState state_{GameState::NotStarted};
};
