const { RIO, Controller } = require('russound-rio');
let Service, Characteristic, Accessory, PlatformAccessory, UUIDGen, rio;

const PLUGIN_NAME = 'homebridge-russound-rio';
const PLATFORM_NAME = 'Russound';
const PLUGIN_VERSION = '0.0.9';

module.exports = function (homebridge) {
  ({ Service, Characteristic, Accessory, uuid } = homebridge.hap);
  PlatformAccessory = homebridge.platformAccessory;
  UUIDGen = uuid;
  homebridge.registerAccessory(PLUGIN_NAME, PLATFORM_NAME, ZoneAccessory);
  homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, RussoundPlatform, true);
};

class RussoundPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.controllers = {};
    this.zones = null;
    this.sources = null;;
    this.log.debugEnabled = (this.config.debug === true)
    this.accessories = [];
    this.api = api;

    if (this.config.controllers === undefined) {
      this.log.error('ERROR: your configuration is incorrect.');
      this.controllers = '';
    }
    rio = new RIO(this.config, this.log);

    rio.on('debug', this.eventDebug.bind(this));
    rio.on('error', this.eventError.bind(this));
    rio.on('connect', this.eventConnect.bind(this));
    rio.on('close', this.eventClose.bind(this));

    rio.on(RIO.enums.EMIT.SYSTEM, this.eventSystem.bind(this));
    rio.on(RIO.enums.EMIT.CONTROLLER, this.eventController.bind(this));
    rio.on(RIO.enums.EMIT.SOURCE, this.eventSource.bind(this));
    rio.on(RIO.enums.EMIT.ZONES, this.eventZones.bind(this));
    rio.on(RIO.enums.EMIT.SOURCES, this.eventSources.bind(this));


    api.on('didFinishLaunching', () => {
      createControllers(this, this.config.controllers);
    })
  }
  /// ////////////////
  // EVENT FUNCTIONS
  /// ////////////////
  eventDebug = (response) => {
    this.log.debug('eventDebug: %s', response);
  };

  eventError = (response) => {
    this.log.error('eventError: %s', response);
  };

  eventConnect = (response) => {
    this.log.info('eventConnect: %s', response);
  };

  eventClose = (response) => {
    this.log.info('eventClose: %s', response);
  };

  eventSource = (sourceId, variable, value) => {
    this.log.debug('Source Event', sourceId, variable, value)
  };

  get savedZones() {
    return this.zones;
  }

  set savedZones(value) {
    this.zones = value;
  }

  get savedSources() {
    return this.sources;
  }

  set savedSources(value) {
    this.sources = value;
  }

  createAccessories = (platform, config) => {
    if (platform && config && rio) {
      config.forEach((controllerConfig) => {
        var createAccessory = true;
        var controller = new Controller(controllerConfig);

        // You must specify at least the IP of the Russound controller.
        if (!controller.ip) {
          platform.log.error('%s: missing required configuration parameters.', controller.name);
          return (new Error("Unable to initialize the Russound plugin: missing configuration parameters."));
        }

        // Initialize our state for this controller. We need to maintain state separately for each controller.
        platform.controllers[controller.ip] = {};
        var cc = platform.controllers[controller.ip];
        cc.zones = this.savedZones
        cc.sources = this.savedSources;
        if (cc.zones && cc.sources) {
          for (let i = 0; i < cc.zones.length; i++) {
            var zone = cc.zones[i];
            var mappedZone = controller.getMappedZone(zone.name);
            createAccessory = mappedZone && !(mappedZone.enable === false);
            if (createAccessory) {
              const uuid = UUIDGen.generate(controller.name + zone.id + controller.ip);
              const existingAccessory = platform.accessories.find(accessory => accessory && accessory.UUID === uuid);
              if (existingAccessory) {
                // the accessory already exists
                platform.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

                existingAccessory.context.device = cc;

                platform.api.updatePlatformAccessories([existingAccessory]);

                const zoneAccessory = new ZoneAccessory(platform, existingAccessory, controller, zone, cc.sources, true);

              } else {
                // create a new accessory
                platform.log.info('Adding new accessory:', `${zone.name} Zone`);

                const accessory = new PlatformAccessory(`${zone.name} Zone`, uuid, Accessory.Categories.AUDIO_RECEIVER);
                accessory.context.device = cc;
                const zoneAccessory = new ZoneAccessory(platform, accessory, controller, zone, cc.sources);

                // link the accessory to your platform
                platform.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);
              }
            }
            else
              platform.log.debug('Zone: %s not added', zone.name);
          }
        }
      });
    }
  }

  eventZones = (controllerId, zones) => {
    if (!this.savedZones) {
      this.log.debug('Zones Event', controllerId, zones)
      this.savedZones = zones;
      if (this.savedSources)
        this.createAccessories(this, this.config.controllers);
    }
  };

  eventSources = (controllerId, sources) => {
    if (!this.savedSources) {
      this.log.debug('Sources Event', controllerId, sources)
      this.savedSources = sources;
      if (this.savedZones)
        this.createAccessories(this, this.config.controllers);
    }

  };

  eventSystem = (variable, value) => {
    this.log.debug('System Event', variable, value)
  };
  eventController = (controllerId, variable, value) => {
    this.log.debug('Controller Event', controllerId, variable, value)
  };

  configureAccessory = (accessory) => {
    this.log.info('Loading accessory from cache:', accessory.displayName);
    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }
}

const createControllers = (platform, config) => {
  if (platform && config && rio) {

    platform.log.info("Connecting to Controller");
    rio.connect().then(() => {
      var Promises = [];
      platform.log.info("Connected to Controller");
      Promises.push(rio.get.systemStatus());
      Promises.push(rio.get.systemVersion());
      Promises.push(rio.get.allControllerCommands());
      Promises.push(rio.get.zoneNames());
      Promises.push(rio.get.sourceNames());
      Promises.push(rio.watch.allZones());
      //await rio.watch.system();
      //await rio.watch.allSources();
      platform.log.debug("Getting controller states and settings");
      Promise.all(Promises).then(() => {
        platform.log.debug("Got controller settings and watching zone changes");
      }).catch((error) => {
        platform.log.error("Error in configuring this Controller: %s", error);
      });
    }).catch((error) => {
      platform.log.error("Error in connecting to Controller: %s", error);
    });
  }
  else {
    if (platform)
      platform.log.info('No Controllers configured.');
  }
}

class ZoneAccessory {
  #platform = null;
  #log = null;
  #accessory = null;
  #enabledServices = [];

  name = null;
  zoneId = null;

  #reload = false;
  #sources = null;
  #controller = null
  #sourceMapping = null;
  #maxVolume = 50;
  #mapVolume100 = true;
  #buttons = {};
  #statusState = false;
  #muteState = false;
  #volumeState = 0;
  #sourceState = null;

  constructor(platform, accessory, controller, zone, sources, reload) {
    this.#platform = platform;
    this.#log = platform.log;
    this.#accessory = accessory;
    this.#reload = reload
    this.#controller = controller;
    this.zoneId = zone.id;
    var zoneName = zone.name;

    accessory.on('identify', this.identifyAccessory);

    var mappedZone = controller.getMappedZone(zoneName)
    if (mappedZone) {
      zoneName = mappedZone.display_name || zoneName;
      this.#sourceMapping = mappedZone.sources;
    }
    var controllerName = controller.name;

    this.name = zoneName + ' Zone';
    this.manufacturer = 'Russound';
    this.serial = `0000-0000-${this.zoneId}`;
    this.model = `${controllerName}-Zone ${this.zoneId}`;

    this.#sources = sources;

    this.#log.debug('maxVolume: %s', this.#maxVolume);
    this.#log.debug('mapVolume100: %s', this.#mapVolume100);
    this.#log.debug('Name %s', this.name);
    this.#log.debug('Zone %s', this.zoneId);
    this.#log.debug('serial: %s', this.serial);

    this.#buttons = {
      //[Characteristic.RemoteKey.REWIND]: 'rew',
      //[Characteristic.RemoteKey.FAST_FORWARD]: 'ff',
      [Characteristic.RemoteKey.NEXT_TRACK]: 'Next',
      [Characteristic.RemoteKey.PREVIOUS_TRACK]: 'Previous',
      [Characteristic.RemoteKey.ARROW_UP]: 'MenuUp', // 4
      [Characteristic.RemoteKey.ARROW_DOWN]: 'MenuDown', // 5
      [Characteristic.RemoteKey.ARROW_LEFT]: 'MenuLeft', // 6
      [Characteristic.RemoteKey.ARROW_RIGHT]: 'MenuRight', // 7
      [Characteristic.RemoteKey.SELECT]: 'Enter', // 8
      [Characteristic.RemoteKey.BACK]: 'Exit', // 9
      [Characteristic.RemoteKey.EXIT]: 'Exit', // 10
      [Characteristic.RemoteKey.PLAY_PAUSE]: 'Play', // 11
      [Characteristic.RemoteKey.INFORMATION]: 'Info' // 15
    };
    rio.on(RIO.enums.EMIT.ZONE, this.eventZone.bind(this));

    this.setUpServices();
    accessory.updateReachability(true);
  }
  identifyAccessory = (paired, callback) => {
    this.#log.info(this.#accessory.displayName, "Identify!");
    callback();
  }


  eventZone = (controllerId, zoneId, variable, value) => {
    if (zoneId === this.zoneId) {
      if (variable === RIO.enums.ZONE.VOLUME)
        this.setVolume(value);
      else if (variable === RIO.enums.ZONE.STATUS)
        this.setStatus(value);
      else if (variable === RIO.enums.ZONE.MUTE)
        this.setMute(value);
      else if (variable === RIO.enums.ZONE.CURRENT_SOURCE)
        this.setSource(value);
      else
        this.#log.debug('Zone Event', controllerId, zoneId, variable, value)
    }
  };

  setStatus(value) {
    if (this.#statusState !== (value === RIO.enums.STATUS.ON))
      this.#log.debug('Event - Status changed: %s, for : %s', value, this.zoneId);

    this.#statusState = (value === RIO.enums.STATUS.ON);
    this.#log.debug('setStatus - message: %s, for zone: %s, new statusState %s', value, this.zoneId, this.#statusState);
    // Communicate status
    if (this.zoneService) {
      this.zoneService.updateCharacteristic(Characteristic.Active, this.#statusState ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);
    }
    // if (this.volumeDimmerService) {
    //   if (!this.#statusState)
    //     this.currentVolume = this.volumeDimmerService.getCharacteristic(Characteristic.Brightness).value;
    //   this.volumeDimmerService.setCharacteristic(Characteristic.On, this.#statusState ? Characteristic.ON : Characteristic.OFF);
    //   if (this.#statusState)
    //     this.volumeDimmerService.setCharacteristic(Characteristic.Brightness, this.currentVolume);
    // }
    // }
    // if (this.volume_dimmer) {
    // 	this.#muteState =  !(response == 'ON');
    // 	this.dimmer.getCharacteristic(Characteristic.On).updateValue((response == 'on'), null, 'status event statusState');
    // }
  }

  setMute(value) {
    this.#muteState = value === RIO.enums.STATUS.ON;
    this.#log.debug('setMute - message: %s, for zone: %s, new muteState %s ', value, this.zoneId, this.#muteState);
    // Communicate status
    if (this.zoneSpeakerService)
      this.zoneSpeakerService.updateCharacteristic(Characteristic.Mute, this.#muteState);
  }

  setSource(value) {
    if (value) {
      const source = this.#sources.find(s => s.id === value);

      // Convert to source input code
      /* eslint no-negated-condition: "warn" */
      if (this.#sourceState !== value)
        this.#log.debug('Event - Source changed: %s, for zone: %s', source.name, this.zoneId);

      this.#sourceState = source.id;

      this.#log.debug('setSource - message: %s, for zone: %s - sourceState: %s - input: %s', value, this.zoneId, this.#sourceState, source.name);
      if (this.zoneService)
        this.zoneService.updateCharacteristic(Characteristic.ActiveIdentifier, this.#sourceState);
    } else {
      // Then invalid Source chosen
      this.#log.error('setSource - ERROR - INVALID INPUT, for zone: %s, - Model does not support selected source.', this.zoneId);
    }
  }

  setVolume(value) {
    //console.log('eventVolume', zoneId, value)
    if (this.#mapVolume100) {
      const volumeMultiplier = this.#maxVolume / 100;
      const newVolume = value / volumeMultiplier;
      this.#volumeState = Math.round(newVolume);
      this.#log.debug('setVolume - message: %s, for zone: %s, volume %s PERCENT', value, this.zoneId, this.#volumeState);
    } else {
      this.#volumeState = value;
      this.#log.debug('setVolume - message: %s, for zone: %s, volume %s ACTUAL', value, this.zoneId, this.#volumeState);
    }
    // Communicate status
    if (this.zoneSpeakerService)
      this.zoneSpeakerService.updateCharacteristic(Characteristic.Volume, this.#volumeState);
    if (this.volumeDimmerService)
      this.volumeDimmerService.updateCharacteristic(Characteristic.Brightness, this.#volumeState);
  }

  /// /////////////////////
  // GET AND SET FUNCTIONS
  /// /////////////////////
  getStatusState(callback) {
    // have the event later on execute changes
    callback(null, this.#statusState);
    this.#log.debug('getStatusState - actual mode, return state: ', this.#statusState, this.state);
    rio.get.zoneStatus(this.zoneId).then((response, error) => {
      if (error) {
        this.#statusState = false;
        this.#log.debug('getStatusState - STATUS QRY: ERROR - current state: %s', this.#statusState);
      }
    });
    // this.zoneService.getCharacteristic(Characteristic.Active).updateValue(this.state);
  }

  setStatusState(statusOn, callback) {
    this.#statusState = statusOn;
    // do the callback immediately, to free homekit
    // have the event later on execute changes
    callback(null, this.#statusState);
    this.#log.debug('setStatusState - actual mode, status state: %s, switching to ON', this.#statusState);
    rio.set.zoneStatus(this.zoneId, statusOn).then((response, error) => {
      if (error) {
        this.#statusState = false;
        this.#log.error('setStatusState - STATUS %s: ERROR - current state: %s', statusOn ? RIO.enums.STATUS.ON : RIO.enums.STATUS.ON, this.#statusState);
      } else {
      }
    });

    // if (this.volume_dimmer) {
    // 	this.#muteState = !(statusOn == 'on');
    // 	this.dimmer.getCharacteristic(Characteristic.On).updateValue((statusOn == 'on'), null, 'status event statusState');
    // }
    //if (this.zoneService)
    //  this.zoneService.updateCharacteristic(Characteristic.Active, this.#statusState);
  }

  getVolumeState(callback, context) {
    // do the callback immediately, to free homekit
    // have the event later on execute changes
    var prevVolume = this.#volumeState;
    callback(null, this.#volumeState);
    this.#log.debug('getVolumeState - actual mode, return volume: ', this.#volumeState);
    rio.get.zoneVolume(this.zoneId).then((response, error) => {
      if (error) {
        this.#volumeState = prevVolume;
        this.#log.debug('getVolumeState - VOLUME QRY: ERROR - current volume: %s', this.#volumeState);
      }
    });
  }

  setVolumeState(level, callback) {

    var preVolume = this.#volumeState;
    //if (this.volumeDimmerService.getCharacteristic(Characteristic.On).value !== Characteristic.ON)
    //  this.currentVolume = preVolume;
    // Are we mapping volume to 100%?
    if (this.#mapVolume100) {
      const volumeMultiplier = this.#maxVolume / 100;
      const newVolume = volumeMultiplier * level;
      this.#volumeState = Math.round(newVolume);
      this.#log.debug('setVolumeState - actual mode, PERCENT, volume: %s', this.#volumeState);
    } else if (level > this.#maxVolume) {
      // Determine if maxVolume threshold breached, if so set to max.
      this.#volumeState = this.#maxVolume;
      this.#log.debug('setVolumeState - VOLUME LEVEL of: %s exceeds maxVolume: %s. Resetting to max.', level, this.#maxVolume);
    } else {
      // Must be using actual volume number
      this.#volumeState = level;
      this.#log.debug('setVolumeState - actual mode, ACTUAL volume: %s', this.#volumeState);
    }

    // do the callback immediately, to free homekit
    // have the event later on execute changes
    callback(null, this.#volumeState);

    //if (this.#volumeState && this.volumeDimmerService.getCharacteristic(Characteristic.On).value === Characteristic.ON)
    rio.set.zoneVolume(this.zoneId, this.#volumeState).then((response, error) => {
      if (error) {
        this.#volumeState = preVolume;
        this.#log.debug('setVolumeState - VOLUME : ERROR - current volume: %s', this.#volumeState);
      }
    });

    if (this.#muteState)
      this.setMuteState(false, () => { });
  }

  setVolumeRelativeUpDown(volumeDirection, callback) {
    this.setVolumeRelative(volumeDirection, callback);
    setTimeout(() => {
      if (this.volumeUpService) this.volumeUpService.getCharacteristic(Characteristic.On).updateValue(false);
      if (this.volumeDownService) this.volumeDownService.getCharacteristic(Characteristic.On).updateValue(false);
    }, 10);
  }


  setVolumeRelative(volumeDirection, callback) {
    // do the callback immediately, to free homekit
    // have the event later on execute changes
    callback(null, this.#volumeState);
    var prevVolume = this.#volumeState;
    if (volumeDirection === Characteristic.VolumeSelector.INCREMENT) {
      this.#log.debug('setVolumeRelative - VOLUME : level-up');
      rio.set.zoneVolumeUpDown(this.zoneId, true).then((response, error) => {
        if (error) {
          this.#volumeState = prevVolume;
          this.#log.error('setVolumeRelative - VOLUME : ERROR - current volume: %s', this.#volumeState);
        }
      });
    } else if (volumeDirection === Characteristic.VolumeSelector.DECREMENT) {
      this.#log.debug('setVolumeRelative - VOLUME : level-down');
      rio.set.zoneVolumeUpDown(this.zoneId, false).then((response, error) => {
        if (error) {
          this.#volumeState = prevVolume;
          this.#log.error('setVolumeRelative - VOLUME : ERROR - current volume: %s', this.#volumeState);
        }
      });
    } else {
      this.#log.error('setVolumeRelative - VOLUME : ERROR - unknown direction sent');
    }
  }
  getMuteState(callback) {
    // do the callback immediately, to free homekit
    // have the event later on execute changes
    callback(null, this.#muteState);
    this.#log.debug('getMuteState - actual mode, return muteState: ', this.#muteState);
    rio.get.zoneMute(this.zoneId).then((response, error) => {
      if (error) {
        this.#muteState = false;
        this.#log.debug('getMuteState - MUTE QRY: ERROR - current muteState: %s', this.#muteState);
      }
    });
  }

  setMuteState(muteOn, callback) {
    // do the callback immediately, to free homekit
    // have the event later on execute changes
    this.#muteState = muteOn;
    callback(null, this.#muteState);
    this.#log.debug('setMuteState - actual mode, this.#muteState: %s, switching to %s', this.#muteState, muteOn ? 'ON' : 'OFF');
    rio.set.zoneMute(this.zoneId, this.#muteState).then((response, error) => {
      if (error) {
        this.#muteState = false;
        this.#log.error('setMuteState - MUTE %s: ERROR - current this.#muteState: %s', muteOn ? 'ON' : 'OFF', this.#muteState);
      }
    })
  }

  getZoneSource(callback) {
    // do the callback immediately, to free homekit
    // have the event later on execute changes
    var prevSource = this.#sourceState;
    this.#log.debug('getZoneSource - actual mode, return source: ', this.#sourceState);
    callback(null, this.#sourceState);
    rio.get.zoneSource(this.zoneId).then((response, error) => {
      if (error) {
        this.#sourceState = prevSource;
        this.#log.error('getZoneSource - INPUT QRY: ERROR - current source: %s', this.#sourceState);
      }
    });
    // this.tvService.getCharacteristic(Characteristic.ActiveIdentifier).updateValue(this.#sourceState);
  }

  setZoneSource(value, callback) {
    var prevSource = this.#sourceState;
    this.#sourceState = value;
    const source = this.#sources.find(s => s.id === value.toString());

    this.#log.debug('setZoneSource - actual mode, ACTUAL input source: %s - %s', this.#sourceState, source.name);

    // do the callback immediately, to free homekit
    // have the event later on execute changes
    callback(null, this.#sourceState);
    rio.set.zoneSource(this.zoneId, this.#sourceState).then((response, error) => {
      if (error) {
        this.#sourceState = prevSource;
        this.#log.error('setZoneSource: ERROR - current source:%s - %s', this.#sourceState, source.name);
      }
    });
  }

  remoteKeyPress(value, callback) {
    // do the callback immediately, to free homekit
    // have the event later on execute changes
    callback(null, value);
    var button = this.#buttons[value];
    if (button) {
      this.#log.debug('remoteKeyPress - INPUT: pressing key %s', button);
      rio.set.zoneKeypress(this.zoneId, button).then((response, error) => {
        if (error) {
          this.#log.error('remoteKeyPress - INPUT: ERROR pressing button %s', button);
        }
      });
    } else {
      this.#log.error('Remote button %d not supported.', value);
    }
  }

  /*
    ////////////////////////
    // ZONE SERVICE FUNCTIONS
    ////////////////////////
  */

  setUpServices() {
    this.setAccessoryInformationService();
    this.zoneService = this.createZoneService();
    this.createZoneSpeakerService(this.zoneService);
    this.createZoneSourceServices(this.zoneService);
    this.createVolumeDimmerService(this.zoneService);
    this.createVolumeButtonServices(this.zoneService);
    this.createMediaControlServices(this.zoneService);

    this.zoneService.setPrimaryService(true);
  }

  setAccessoryInformationService() {
    this.infoService = this.#accessory.getServiceById(Service.AccessoryInformation);
    this.infoService
      .updateCharacteristic(Characteristic.Name, this.name)
      .updateCharacteristic(Characteristic.Manufacturer, this.manufacturer)
      .updateCharacteristic(Characteristic.Model, this.model)
      .updateCharacteristic(Characteristic.SerialNumber, this.serial)
      .updateCharacteristic(Characteristic.FirmwareRevision, PLUGIN_VERSION);
    var configuredName = this.infoService.getCharacteristic(Characteristic.ConfiguredName) || this.infoService.addCharacteristic(Characteristic.ConfiguredName);
    if (configuredName.value === '')
      configuredName.setValue(`${this.name}`)
    // .setProps({
    //   perms: [Characteristic.Perms.READ]
    // });
    this.#enabledServices.push(this.infoService)
  }

  createZoneService() {
    this.#log.debug('Creating Zone service for controller %s', this.name);
    const zoneService = this.#accessory.getServiceById(Service.Television, 'zoneservice') || this.#accessory.addService(Service.Television, this.name, 'zoneservice');

    var configuredName = zoneService.getCharacteristic(Characteristic.ConfiguredName) || zoneService.addCharacteristic(Characteristic.ConfiguredName);
    if (configuredName.value === '')
      configuredName.setValue(this.name)

    zoneService
      .setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    zoneService
      .getCharacteristic(Characteristic.Active)
      .on('get', this.getStatusState.bind(this))
      .on('set', this.setStatusState.bind(this));

    zoneService
      .getCharacteristic(Characteristic.ActiveIdentifier)
      .on('set', this.setZoneSource.bind(this))
      .on('get', this.getZoneSource.bind(this));

    zoneService
      .getCharacteristic(Characteristic.RemoteKey)
      .on('set', this.remoteKeyPress.bind(this));

    this.#enabledServices.push(zoneService);
    return zoneService;
  }
  createZoneSourceServices(zoneService) {
    //Remove all input services
    do {
      var service = this.#accessory.getService(Service.InputSource)
      if (service) {
        this.#accessory.removeService(service);
      }
    }
    while (service);


    this.#sources.forEach((source) => {
      var sourceName = source.name;
      var sourceId = source.id;
      if ((sourceName === RIO.enums.INVALID.SOURCE_NAME) || (this.#sourceMapping && !this.#sourceMapping.find(s => s === sourceName))) {
        this.#log.debug('Source %s:%s NOT created for zone %s', sourceId, sourceName, this.name)
      }
      else {
        var sm = this.#controller.getMappedSource(sourceName);
        if (sm) {
          sourceName = sm.display_name || sourceName;
          this.createZoneSourceService(sourceName, sourceId, zoneService);
        }
        else {
          this.#log.debug('Source %s:%s NOT mapped', sourceId, sourceName)
        }
      }
    });
  }

  createZoneSourceService(name, id, zoneService) {
    const input = this.#accessory.getServiceById(Service.InputSource, `input${id}`) || this.#accessory.addService(Service.InputSource, name, `input${id}`);
    const inputSourceType = Characteristic.InputSourceType.APPLICATION;

    input
      .setCharacteristic(Characteristic.Identifier, id)
      .setCharacteristic(Characteristic.ConfiguredName, name)
      .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
      .setCharacteristic(Characteristic.InputSourceType, inputSourceType);
    //Important to get as a selector
    input.getCharacteristic(Characteristic.ConfiguredName).setProps({
      perms: [Characteristic.Perms.READ]
    });
    var inputDeviceType = input.getCharacteristic(Characteristic.InputDeviceType) || input.addCharacteristic(Characteristic.InputDeviceType)
    if (inputDeviceType)
      input.updateCharacteristic(Characteristic.InputDeviceType, Characteristic.InputDeviceType.AUDIO_SYSTEM)
    zoneService.addLinkedService(input);
    this.#enabledServices.push(input)
  }


  createVolumeDimmerService(zoneService) {
    this.volumeDimmerService = this.#accessory.getServiceById(Service.Lightbulb, 'volumeDimmerService') || this.#accessory.addService(Service.Lightbulb, 'Volume', 'volumeDimmerService');
    var volume = this.volumeDimmerService.getCharacteristic(Characteristic.Brightness) || this.volumeDimmerService.addCharacteristic(Characteristic.Brightness)
    volume
      .on('get', this.getVolumeState.bind(this))
      .on('set', this.setVolumeState.bind(this));
    this.volumeDimmerService
      .getCharacteristic(Characteristic.On)
      // Inverted logic taken from https://github.com/langovoi/homebridge-upnp
      .on('get', callback => {
        this.getMuteState((err, value) => {
          if (err) {
            callback(err);
            return;
          }

          callback(null, !value);
        });
      })
      .on('set', (value, callback) => this.setMuteState(!value, callback));

    zoneService.addLinkedService(this.volumeDimmerService);
    this.#enabledServices.push(this.volumeDimmerService);
  }

  getVolumeSwitch(callback) {
    callback(null, false);
  }
  createVolumeButtonServices(zoneService) {
    this.volumeUpService = this.#accessory.getServiceById(Service.Switch, 'volumeUpService') || this.#accessory.addService(Service.Switch, 'Volume Up', 'volumeUpService');
    this.volumeUpService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getVolumeSwitch.bind(this))
      .on('set', (state, callback) => {
        this.setVolumeRelativeUpDown(Characteristic.VolumeSelector.INCREMENT, callback);
      });
    zoneService.addLinkedService(this.volumeUpService);
    this.#enabledServices.push(this.volumeUpService);

    this.volumeDownService = this.#accessory.getServiceById(Service.Switch, 'volumeDownService') || this.#accessory.addService(Service.Switch, 'Volume Down', 'volumeDownService');
    this.volumeDownService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getVolumeSwitch.bind(this))
      .on('set', (state, callback) => {
        this.setVolumeRelativeUpDown(Characteristic.VolumeSelector.DECREMENT, callback);
      });

    zoneService.addLinkedService(this.volumeDownService);
    this.#enabledServices.push(this.volumeDownService);

    this.muteService = this.#accessory.getServiceById(Service.Switch, 'muteService') || this.#accessory.addService(Service.Switch, 'Mute', 'muteService');
    this.muteService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getMuteState.bind(this))
      .on('set', this.setMuteState.bind(this));
    zoneService.addLinkedService(this.muteService);
    this.#enabledServices.push(this.muteService);
  }

  createZoneSpeakerService(zoneService) {
    this.zoneSpeakerService = this.#accessory.getServiceById(Service.TelevisionSpeaker, 'zoneSpeakerService') || this.#accessory.addService(Service.TelevisionSpeaker, `Volume`, 'zoneSpeakerService');
    this.zoneSpeakerService
      .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
      .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
    this.zoneSpeakerService
      .getCharacteristic(Characteristic.VolumeSelector)
      .on('set', this.setVolumeRelative.bind(this));
    this.zoneSpeakerService
      .getCharacteristic(Characteristic.Mute)
      .on('get', this.getMuteState.bind(this))
      .on('set', this.setMuteState.bind(this));

    var volume = this.zoneSpeakerService.getCharacteristic(Characteristic.Volume) || this.zoneSpeakerService.addCharacteristic(Characteristic.Volume)
    volume
      .on('get', this.getVolumeState.bind(this))
      .on('set', this.setVolumeState.bind(this));

    zoneService.addLinkedService(this.zoneSpeakerService);
    this.#enabledServices.push(this.zoneSpeakerService);
  }
  getMediaControlSwitch(callback) {
    callback(null, false);
  }

  setMediaControlSwitch(state, callback, action) {
    this.#log.debug('Media control service - current media %s', action);
    if (action === 'play') {
      //this.lgtv.request('ssap://media.controls/play');
    } else if (action === 'pause') {
      //this.lgtv.request('ssap://media.controls/pause');
    } else if (action === 'stop') {
      //this.lgtv.request('ssap://media.controls/stop');
    } else if (action === 'rewind') {
      //this.lgtv.request('ssap://media.controls/rewind');
    } else if (action === 'fastForward') {
      // this.lgtv.request('ssap://media.controls/fastForward');
    }
    setTimeout(() => {
      if (this.mediaPlayService) this.mediaPlayService.getCharacteristic(Characteristic.On).updateValue(false);
      if (this.mediaPauseService) this.mediaPauseService.getCharacteristic(Characteristic.On).updateValue(false);
      if (this.mediaStopService) this.mediaStopService.getCharacteristic(Characteristic.On).updateValue(false);
      if (this.mediaRewindService) this.mediaRewindService.getCharacteristic(Characteristic.On).updateValue(false);
      if (this.mediaFastForwardService) this.mediaFastForwardService.getCharacteristic(Characteristic.On).updateValue(false);
    }, 10);
    callback();
  }


  createMediaControlServices(zoneService) {
    this.mediaPlayService = this.#accessory.getServiceById(Service.Switch, 'mediaPlayService') || this.#accessory.addService(Service.Switch, 'Play', 'mediaPlayService');
    this.mediaPlayService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getMediaControlSwitch.bind(this))
      .on('set', (state, callback) => {
        this.setMediaControlSwitch(state, callback, 'play');
      });
    zoneService.addLinkedService(this.mediaPlayService);
    this.#enabledServices.push(this.mediaPlayService);

    this.mediaPauseService = this.#accessory.getServiceById(Service.Switch, 'mediaPauseService') || this.#accessory.addService(Service.Switch, 'Pause', 'mediaPauseService');
    this.mediaPauseService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getMediaControlSwitch.bind(this))
      .on('set', (state, callback) => {
        this.setMediaControlSwitch(state, callback, 'pause');
      });
    zoneService.addLinkedService(this.mediaPauseService);
    this.#enabledServices.push(this.mediaPauseService);

    this.mediaStopService = this.#accessory.getServiceById(Service.Switch, 'mediaStopService') || this.#accessory.addService(Service.Switch, 'Stop', 'mediaStopService');
    this.mediaStopService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getMediaControlSwitch.bind(this))
      .on('set', (state, callback) => {
        this.setMediaControlSwitch(state, callback, 'stop');
      });
    zoneService.addLinkedService(this.mediaStopService);
    this.#enabledServices.push(this.mediaStopService);

    this.mediaRewindService = this.#accessory.getServiceById(Service.Switch, 'mediaRewindService') || this.#accessory.addService(Service.Switch, 'Rewind', 'mediaRewindService');
    this.mediaRewindService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getMediaControlSwitch.bind(this))
      .on('set', (state, callback) => {
        this.setMediaControlSwitch(state, callback, 'rewind');
      });

    zoneService.addLinkedService(this.mediaRewindService);
    this.#enabledServices.push(this.mediaRewindService);

    this.mediaFastForwardService = this.#accessory.getServiceById(Service.Switch, 'mediaFastForwardService') || this.#accessory.addService(Service.Switch, 'Fast Forward', 'mediaFastForwardService');
    this.mediaFastForwardService
      .getCharacteristic(Characteristic.On)
      .on('get', this.getMediaControlSwitch.bind(this))
      .on('set', (state, callback) => {
        this.setMediaControlSwitch(state, callback, 'fastForward');
      });
    zoneService.addLinkedService(this.mediaFastForwardService);
    this.#enabledServices.push(this.mediaFastForwardService);
  }
}