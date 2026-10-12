#include "board.hpp"
#include <array>
#include <utility>

Board::Board()
    : rows_(kRows), cols_(kCols),
      grid_(rows_, std::vector<std::optional<DiscColor>>(cols_, std::nullopt)) {
}

bool Board::can_place(Column col) const {
  return in_bounds_col(col) && !grid_[0][std::to_underlying(col)].has_value();
}

int Board::rows_count() const { return rows_; }

int Board::cols_count() const { return cols_; }

std::optional<Row> Board::place_disc(Column col, DiscColor color) {
  if (!can_place(col)) {
    return std::nullopt;
  }

  for (int row = rows_ - 1; row >= 0; --row) {
    if (!grid_[row][std::to_underlying(col)].has_value()) {
      grid_[row][std::to_underlying(col)] = color;
      return Row{row};
    }
  }

  return std::nullopt;
}

bool Board::check_win(Row row, Column col, DiscColor color) const {
  return !get_winning_lines(row, col, color).empty();
}

std::vector<WinningLine> Board::get_winning_lines(Row row, Column col,
                                               DiscColor color) const {
  if (get_cell(row, col) != color) {
    return {};
  }

  constexpr std::array<std::pair<int, int>, 4> directions{
      {{1, 1}, {1, 0}, {1, -1}, {0, 1}}};
  std::vector<WinningLine> winning_lines;
  for (const auto &[row_step, column_step] : directions) {
    int first_row = std::to_underlying(row);
    int first_column = std::to_underlying(col);
    while (get_cell(Row{first_row - row_step},
                   Column{first_column - column_step}) == color) {
      first_row -= row_step;
      first_column -= column_step;
    }

    WinningLine line;
    for (int current_row = first_row, current_column = first_column;
         get_cell(Row{current_row}, Column{current_column}) == color;
         current_row += row_step, current_column += column_step) {
      line.push_back({Row{current_row}, Column{current_column}});
    }

    if (line.size() >= 4) {
      winning_lines.push_back(std::move(line));
    }
  }

  return winning_lines;
}

bool Board::is_full() const {
  for (int col = 0; col < cols_; ++col) {
    if (!grid_[0][col].has_value()) {
      return false;
    }
  }
  return true;
}

std::optional<DiscColor> Board::get_cell(Row row, Column col) const {
  if (!in_bounds_col(col) || !in_bounds_row(row)) {
    return std::nullopt;
  }
  return grid_[std::to_underlying(row)][std::to_underlying(col)];
}

bool Board::in_bounds_col(Column col) const {
  return 0 <= std::to_underlying(col) && std::to_underlying(col) < cols_;
}

bool Board::in_bounds_row(Row row) const {
  return 0 <= std::to_underlying(row) && std::to_underlying(row) < rows_;
}
