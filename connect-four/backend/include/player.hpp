#pragma once

#include "utils.hpp"
#include <functional>
#include <optional>
#include <string>
#include <unordered_map>

enum class PlayerId : int {};

class Player {
public:
  Player(std::string name, DiscColor color);

  std::string get_name() const;

  DiscColor get_color() const;

  void set_name(std::string name);

  void set_color(DiscColor color);

private:
  std::string name_;
  DiscColor color_;
};

class PlayerRegistry {
public:
  void add_player(PlayerId player_id, Player player);

  void remove_player(PlayerId player_id);

  std::optional<const Player> get_player(PlayerId player_id) const;

  void update_player(PlayerId player_id,
                     const std::function<void(Player &)> &updater);

private:
  std::unordered_map<PlayerId, Player> registry_;
};
