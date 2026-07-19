const { modeOptions, typeOptions, bandOptions, modeLabelMap, typeLabelMap, bandLabelMap } = require('./utils/constants');
const { config, isReleaseProfileReady } = require('./utils/config');
const { getMiniProgramRuntimeInfo } = require('./utils/runtime');

App({
  globalData: {
    currentResult: null,
    modeOptions,
    typeOptions,
    bandOptions,
    maps: {
      modeLabelMap,
      typeLabelMap,
      bandLabelMap
    },
    runtime: {
      activeProfile: config.activeProfile,
      profileLabel: config.profileLabel,
      serviceMode: config.serviceMode,
      apiBaseUrl: config.apiBaseUrl,
      releaseReady: isReleaseProfileReady(config),
      miniProgram: getMiniProgramRuntimeInfo()
    }
  }
});
