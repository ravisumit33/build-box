#pragma once

#include "utils.hpp"
#include <optional>
#include <vector>

enum class Row : int {};
enum class Column : int {};

struct CellPosition {
  Row row;
  Column column;

  friend bool operator==(const CellPosition &, const CellPosition &) = default;
};

using WinningLine = std::vector<CellPosition>;

class Board {
public:
  Board();

  bool can_place(Column col) const;

  int rows_count() const;

  int cols_count() const;

  std::optional<Row> place_disc(Column col, DiscColor color);

  bool check_win(Row row, Column col, DiscColor color) const;

  std::vector<WinningLine> get_winning_lines(Row row, Column col,
                                             DiscColor color) const;

  bool is_full() const;

  std::optional<DiscColor> get_cell(Row row, Column col) const;

private:
  static constexpr int kRows = 6;
  static constexpr int kCols = 7;

  int rows_{};
  int cols_{};
  std::vector<std::vector<std::optional<DiscColor>>> grid_;

  bool in_bounds_col(Column col) const;
  bool in_bounds_row(Row row) const;
};
