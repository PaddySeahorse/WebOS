import React from 'react'
import {
  useWindowManagerStore,
  WALLPAPER_OPTIONS,
} from './store/windowManagerStore'

const LANGUAGES = [
  { id: 'en-US', name: 'English (US)' },
  { id: 'zh-CN', name: '简体中文' },
  { id: 'ja-JP', name: '日本語' },
  { id: 'fr-FR', name: 'Français' },
]

const ACCENT_COLORS = [
  '#3b82f6', // Blue
  '#ef4444', // Red
  '#10b981', // Green
  '#f59e0b', // Amber
  '#8b5cf6', // Violet
  '#ec4899', // Pink
]

export function SettingsPanel() {
  const currentWallpaperId = useWindowManagerStore((state) => state.currentWallpaperId)
  const setWallpaper = useWindowManagerStore((state) => state.setWallpaper)
  const theme = useWindowManagerStore((state) => state.theme)
  const setTheme = useWindowManagerStore((state) => state.setTheme)
  const accentColor = useWindowManagerStore((state) => state.accentColor)
  const setAccentColor = useWindowManagerStore((state) => state.setAccentColor)
  const language = useWindowManagerStore((state) => state.language)
  const setLanguage = useWindowManagerStore((state) => state.setLanguage)

  const [activeTab, setActiveTab] = React.useState<'personalization' | 'system' | 'shortcuts'>('personalization')

  return (
    <div className="settings-container">
      <nav className="settings-sidebar">
        <button
          className={activeTab === 'personalization' ? 'active' : ''}
          onClick={() => setActiveTab('personalization')}
        >
          🎨 Personalization
        </button>
        <button
          className={activeTab === 'system' ? 'active' : ''}
          onClick={() => setActiveTab('system')}
        >
          ⚙️ System
        </button>
        <button
          className={activeTab === 'shortcuts' ? 'active' : ''}
          onClick={() => setActiveTab('shortcuts')}
        >
          ⌨️ Shortcuts
        </button>
      </nav>

      <div className="settings-main">
        {activeTab === 'personalization' && (
          <section>
            <h3>Wallpaper</h3>
            <div className="wallpaper-grid">
              {WALLPAPER_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={`wallpaper-preview ${currentWallpaperId === option.id ? 'selected' : ''}`}
                  style={{ background: option.background }}
                  onClick={() => setWallpaper(option.id)}
                  title={option.name}
                >
                  <span>{option.name}</span>
                </button>
              ))}
            </div>

            <h3>Theme</h3>
            <div className="setting-row">
              <label>Mode</label>
              <select value={theme} onChange={(e) => setTheme(e.target.value as 'light' | 'dark')}>
                <option value="dark">Dark</option>
                <option value="light">Light</option>
              </select>
            </div>

            <h3>Accent Color</h3>
            <div className="color-grid">
              {ACCENT_COLORS.map((color) => (
                <button
                  key={color}
                  className={`color-swatch ${accentColor === color ? 'selected' : ''}`}
                  style={{ backgroundColor: color }}
                  onClick={() => setAccentColor(color)}
                />
              ))}
            </div>
          </section>
        )}

        {activeTab === 'system' && (
          <section>
            <h3>Language / Locale</h3>
            <div className="setting-row">
              <label>System Language</label>
              <select value={language} onChange={(e) => setLanguage(e.target.value)}>
                {LANGUAGES.map((lang) => (
                  <option key={lang.id} value={lang.id}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>

            <h3>About WebOS</h3>
            <div className="about-info">
              <p><strong>Version:</strong> 0.2.0 (Phase 2)</p>
              <p><strong>Environment:</strong> Browser Native</p>
              <p><strong>Stack:</strong> React, TypeScript, Zustand, Tailwind</p>
              <p>
                A browser-based desktop environment that runs entirely in the browser — no server-side OS required.
              </p>
            </div>
          </section>
        )}

        {activeTab === 'shortcuts' && (
          <section>
            <h3>Keyboard Shortcuts</h3>
            <ul className="shortcuts-list">
              <li><kbd>Win</kbd> / <kbd>Cmd</kbd> + <kbd>S</kbd> : Open Search / Launcher</li>
              <li><kbd>Alt</kbd> + <kbd>Tab</kbd> : Switch Windows</li>
              <li><kbd>Win</kbd> / <kbd>Cmd</kbd> + <kbd>D</kbd> : Show Desktop</li>
              <li><kbd>Win</kbd> / <kbd>Cmd</kbd> + <kbd>L</kbd> : Lock Screen (Coming Soon)</li>
              <li><kbd>Ctrl</kbd> + <kbd>Alt</kbd> + <kbd>T</kbd> : Open Terminal</li>
            </ul>
          </section>
        )}
      </div>
    </div>
  )
}
