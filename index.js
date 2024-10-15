const { RIO } = require('russound-rio');
const ZoneAccessory = require('./zoneAccessory');
let Categories, PlatformAccessory, UUIDGen;

const PLUGIN_NAME = 'homebridge-russound-rio';
const PLATFORM_NAME = 'Russound';

module.exports = function (api) {
  api.registerAccessory(PLUGIN_NAME, PLATFORM_NAME, ZoneAccessory);
  api.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, RussoundPlatform, true);
};

class RussoundPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.api = api;

    this.log.debugEnabled = (this.config.debug === true)

    Categories = api.hap.Categories;
    PlatformAccessory = api.platformAccessory;
    UUIDGen = api.hap.uuid;

    this.controllers = [];
    this.zones = null;
    this.sources = null;;
    this.accessories = [];
    this.addRemote = false;
    if (this.config.controllers === undefined) {
      this.log.error('ERROR: your configuration is incorrect.');
      this.controllers = null;
    }
    if (this.config.addRemote != undefined) {
      this.addRemote = this.config.addRemote;
    }

    this.rio = null;
    api.on('didFinishLaunching', () => {
      this.setupControllers();
    })
  }
  ///////////////////
  // EVENT FUNCTIONS
  ///////////////////
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

  eventSystem = (variable, value) => {
    this.log.debug('System Event', variable, value)
  };

  eventController = (controllerId, variable, value) => {
    this.log.debug('Controller Event', controllerId, variable, value)
  };

  eventSource = (sourceId, variable, value) => {
    this.log.debug('Source Event', sourceId, variable, value)
  };

  //When Configured Zones have been determined 
  eventConfiguredZones = (controllerId) => {
    this.log.debug('Configured Zones Event', controllerId)
    this.createAccessories(controllerId);
  };

  ///////////////////
  // SETUP CONTROLLERS
  ///////////////////

  setupControllers = () => {
    this.rio = new RIO(this.config, this.log);
    var controller = this.rio.defaultController;
    this.controllers.push(controller);
    controller.on(RIO.enums.EMIT.CONFIGURED_ZONES, this.eventConfiguredZones.bind(this));

    this.rio.on('debug', this.eventDebug.bind(this));
    this.rio.on('error', this.eventError.bind(this));
    this.rio.on('connect', this.eventConnect.bind(this));
    this.rio.on('close', this.eventClose.bind(this));

    this.rio.on(RIO.enums.EMIT.SYSTEM, this.eventSystem.bind(this));
    this.rio.on(RIO.enums.EMIT.CONTROLLER, this.eventController.bind(this));
    this.rio.on(RIO.enums.EMIT.SOURCE, this.eventSource.bind(this));

    if (this.rio) {

      this.log.info("Connecting to Controller");

      this.rio.connect().then(() => {
        var Promises = [];
        this.log.info("Connected to Controller");
        Promises.push(this.rio.get.systemStatus());
        Promises.push(this.rio.get.systemVersion());
        Promises.push(this.rio.get.allControllerCommands());
        //These three requests are need to populate controller zones, sources and to watch zone events
        Promises.push(this.rio.get.zoneNames());
        Promises.push(this.rio.get.sourceNames());
        Promises.push(this.rio.watch.allZones());
        //await this.rio.watch.system();
        //await this.rio.watch.allSources();
        this.log.debug("Getting controller states and settings");
        Promise.all(Promises).then(() => {
          this.log.debug("Got controller settings and watching zone changes");
        }).catch((error) => {
          this.log.error("Error in configuring this Controller: %s", error);
        });
      }).catch((error) => {
        this.log.error("Error in connecting to Controller: %s", error);
      });
    }
    else {
      this.log.info('No Controllers configured.');
    }
  }

  ///////////////////
  // CREATE ACCESSORIES
  ///////////////////

  getController = (controllerId) => {
    if (this.controllers && this.controllers.length > 0)
      return this.controllers.find(c => c.controllerId === controllerId);
    else return null;

  }
  createAccessories = (controllerId) => {
    if (this.accessories.length > 0) {
      this.log.debug('createAccessories - accessories already created for controller: %s', controllerId);
      return;
    }
    else {
      var controller = this.getController(controllerId);
      if (controller) {
        this.log.info('Creating Accessories');
        // You must specify at least the IP of the Russound controller.
        if (!controller.ip) {
          this.log.error('%s: missing required configuration parameters.', controller.name);
          return (new Error("Unable to initialize the Russound plugin: missing configuration parameters."));
        }

        // Initialize our state for this controller. We need to maintain state separately for each controller.
        if (controller.configuredZones) {
          controller.configuredZones.forEach(zone => {

            const uuid = UUIDGen.generate(`${controller.name}:${controller.controllerId}:${zone.id}:${zone.name}`);
            const existingAccessory = this.accessories.find(accessory => accessory.category === Categories.AUDIO_RECEIVER && accessory.UUID === uuid);
            if (existingAccessory) {
              // the accessory already exists
              this.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

              this.api.updatePlatformAccessories([existingAccessory]);

              const zoneAccessory = new ZoneAccessory(this, existingAccessory, controller, zone, this.addRemote, true);

            } else {
              // create a new accessory
              this.log.info('Adding new accessory: %s, %s', `${zone.display_name} Speaker`, zone.name);

              const accessory = new PlatformAccessory(`${zone.display_name} Speaker`, uuid, Categories.AUDIO_RECEIVER);
              const zoneAccessory = new ZoneAccessory(this, accessory, controller, zone, this.addRemote);

              // link the accessory to your platform
              this.api.publishExternalAccessories(PLUGIN_NAME, [accessory]);

              this.accessories.push(accessory);
            }
          });
          this.log.debug('Added %s new accessories', this.accessories ? this.accessories.length : 0);

        }
        else
          this.log.debug('No Configured Zones for controller: %s, %s', controllerId, this.controllers);

      }
    }
  }

  configureAccessory = (accessory) => {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
    this.log.info(this.accessories)
  }
}