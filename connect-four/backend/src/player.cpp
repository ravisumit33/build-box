#include "player.hpp"
#include <utility>

Player::Player(std::string name, DiscColor color)
    : name_(std::move(name)), color_(color) {}

std::string Player::get_name() const { return name_; }

DiscColor Player::get_color() const { return color_; }

void Player::set_name(std::string name) { name_ = std::move(name); }

void Player::set_color(DiscColor color) { color_ = color; }

void PlayerRegistry::add_player(PlayerId player_id, Player player) {
  registry_.emplace(player_id, std::move(player));
}

void PlayerRegistry::remove_player(PlayerId player_id) {
  registry_.erase(player_id);
}

std::optional<const Player>
PlayerRegistry::get_player(PlayerId player_id) const {
  auto entry = registry_.find(player_id);
  if (entry == registry_.end()) {
    return std::nullopt;
  }
  return entry->second;
}

void PlayerRegistry::update_player(
    PlayerId player_id, const std::function<void(Player &)> &updater) {
  if (auto entry = registry_.find(player_id); entry != registry_.end()) {
    updater(entry->second);
  }
}
