#pragma once

#include "game.hpp"
#include <optional>
#include <vector>

struct GameSnapshot {
  std::vector<std::vector<std::optional<DiscColor>>> board;
  PlayerId current_player_id;
  GameState state;
  std::optional<PlayerId> winner_id;
  std::vector<WinningLine> winning_lines;
};

class GameSession {
public:
  GameSession();

  GameSession(const GameSession &) = delete;
  GameSession &operator=(const GameSession &) = delete;
  GameSession(GameSession &&) = delete;
  GameSession &operator=(GameSession &&) = delete;
  ~GameSession() = default;

  bool make_move(int column);

  GameSnapshot get_snapshot() const;

  void reset();

private:
  // Game retains a reference to this registry, so member order matters.
  PlayerRegistry player_registry_;
  Game game_;
};
