const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    maintenance: { type: Boolean, default: false },
    maintenanceMessage: { type: String, default: 'المتجر في صيانة، نعتذر للإزعاج.' }
});

module.exports = mongoose.model('Settings', settingsSchema);