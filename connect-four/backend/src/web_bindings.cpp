#include "game_session.hpp"
#include <cmath>
#include <emscripten/bind.h>
#include <emscripten/val.h>
#include <limits>
#include <stdexcept>
#include <string>
#include <utility>

namespace {
const char *state_name(GameState state) {
  switch (state) {
  case GameState::NotStarted:
    return "not_started";
  case GameState::InProgress:
    return "in_progress";
  case GameState::Won:
    return "won";
  case GameState::Draw:
    return "draw";
  }
  throw std::logic_error("Unknown game state");
}

bool make_move(GameSession &session, double column) {
  if (!std::isfinite(column) || std::trunc(column) != column || column < 0 ||
      column > std::numeric_limits<int>::max()) {
    return false;
  }
  return session.make_move(static_cast<int>(column));
}

emscripten::val get_snapshot(const GameSession &session) {
  const auto snapshot = session.get_snapshot();
  auto result = emscripten::val::object();
  auto board = emscripten::val::array();
  for (const auto &cells : snapshot.board) {
    auto row = emscripten::val::array();
    for (const auto &cell : cells) {
      row.call<void>(
          "push",
          cell ? emscripten::val(*cell == DiscColor::Red ? "red" : "yellow")
               : emscripten::val::null());
    }
    board.call<void>("push", row);
  }
  result.set("board", board);
  result.set("currentPlayerId", std::to_underlying(snapshot.current_player_id));
  result.set("state", std::string(state_name(snapshot.state)));
  result.set("winnerId",
             snapshot.winner_id
                 ? emscripten::val(std::to_underlying(*snapshot.winner_id))
                 : emscripten::val::null());
  auto winning_lines = emscripten::val::array();
  for (const auto &line : snapshot.winning_lines) {
    auto cells = emscripten::val::array();
    for (const auto &cell : line) {
      auto position = emscripten::val::object();
      position.set("row", std::to_underlying(cell.row));
      position.set("column", std::to_underlying(cell.column));
      cells.call<void>("push", position);
    }
    winning_lines.call<void>("push", cells);
  }
  result.set("winningLines", winning_lines);
  return result;
}
} // namespace

EMSCRIPTEN_BINDINGS(connect_four) {
  emscripten::class_<GameSession>("GameSession")
      .constructor<>()
      .function("makeMove", &make_move)
      .function("getSnapshot", &get_snapshot)
      .function("reset", &GameSession::reset);
}
