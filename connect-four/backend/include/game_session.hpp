#pragma once

#include "ai_controller.hpp"
#include "game.hpp"
#include <functional>
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

  void start_computer_search(Difficulty difficulty, int request_id,
                             std::function<void(ComputerSearch)> complete);
  void cancel_computer_search();

private:
  // Game retains a reference to this registry, so member order matters.
  PlayerRegistry player_registry_;
  Game game_;
  AiController computer_;
};
