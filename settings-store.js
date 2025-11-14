const fs = require('fs');
const path = require('path');

class SettingsStore {
  constructor() {
    this.storePath = null;
    this.defaults = {
      downloadFolder: null,
      downloadHistory: [],
      subtitleLanguages: ['sq', 'en']
    };
    this.data = { ...this.defaults };
    this.isInitialized = false;
  }

  initialize(app) {
    if (this.isInitialized) {
      return;
    }

    const userDataDir = app.getPath('userData');
    this.storePath = path.join(userDataDir, 'settings.json');
    this.defaults.downloadFolder = app.getPath('downloads');
    this.data = { ...this.defaults };
    this.load();
    this.isInitialized = true;
  }

  load() {
    try {
      const raw = fs.readFileSync(this.storePath, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = { ...this.defaults, ...parsed };
    } catch (error) {
      if (error.code !== 'ENOENT') {
        console.error('Failed to load settings:', error);
      }
      this.data = { ...this.defaults };
    }
  }

  save() {
    if (!this.storePath) {
      throw new Error('Settings store is not initialized yet.');
    }

    fs.mkdirSync(path.dirname(this.storePath), { recursive: true });
    fs.writeFileSync(this.storePath, JSON.stringify(this.data, null, 2), 'utf8');
  }

  update(partial) {
    this.ensureInitialized();
    this.data = { ...this.data, ...partial };
    this.save();
    return this.getAll();
  }

  getAll() {
    this.ensureInitialized();
    return { ...this.data };
  }

  get(key) {
    this.ensureInitialized();
    return this.data[key];
  }

  ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('Settings store must be initialized before use.');
    }
  }
}

module.exports = new SettingsStore();
