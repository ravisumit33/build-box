import type { GameSettings } from "../use-game";

interface GameSettingsFormProps {
  settings: GameSettings;
  disabled: boolean;
  onChange: (settings: GameSettings) => void;
  onApply: () => void;
}

export function GameSettingsForm({
  settings,
  disabled,
  onChange,
  onApply,
}: GameSettingsFormProps) {
  return (
    <fieldset
      className="settings"
      aria-label="Game settings"
      disabled={disabled}
    >
      <label>
        Mode
        <select
          value={settings.mode}
          onChange={(event) => onChange({
            ...settings,
            mode: event.target.value === "computer" ? "computer" : "two_players",
          })}
        >
          <option value="computer">Play computer</option>
          <option value="two_players">Two players</option>
        </select>
      </label>
      {settings.mode === "computer" && (
        <>
          <label>
            Difficulty
            <select
              value={settings.difficulty}
              onChange={(event) => {
                const difficulty = event.target.value;
                if (difficulty === "easy" || difficulty === "medium" || difficulty === "hard") {
                  onChange({ ...settings, difficulty });
                }
              }}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </label>
          <label>
            Your side
            <select
              value={settings.humanPlayerId}
              onChange={(event) => onChange({
                ...settings,
                humanPlayerId: event.target.value === "1" ? 1 : 2,
              })}
            >
              <option value="1">Red (first)</option>
              <option value="2">Yellow (second)</option>
            </select>
          </label>
        </>
      )}
      <button className="apply-settings" type="button" onClick={onApply}>
        Apply &amp; start new game
      </button>
    </fieldset>
  );
}
