# homebridge-russound-rio

`homebridge-russound-rio` is a plugin for Homebridge intended to give you an integrated experience with your [Russound](https://russound.com) MCA devices.

It provides the HomeKit Zone Accesories with services which include a power, input, volume, mute and volume dimmer (as light slider).

## Requirements and Limitations

## Installation

If you are new to Homebridge, please first read the Homebridge [documentation](https://www.npmjs.com/package/homebridge).

1. Install Homebridge:
```sh
sudo npm install -g --unsafe-perm homebridge
```

2. Install homebridge-russound-rio:
```sh
sudo npm install -g --unsafe-perm homebridge-russound-rio
```

## Plugin configuration
Add the platform in `config.json` in your home directory inside `.homebridge` and edit the required fields.

```js
"platforms": [
    {
            "name": "Russound",
            "controllers": [
                {
                    "name": "MCA 88X",
                    "ip": "your.russound.ip",
                    "port": 9621,
                    "zones": 6,
                    "sources": 6
                }
            ],
            "debug": false,
            "platform": "Russound"
    }
]
```

After restarting Homebridge, the Russound will need to be manually paired in the Home app, to do this:

1. Open the Home <img src="https://user-images.githubusercontent.com/3979615/78010622-4ea1d380-738e-11ea-8a17-e6a465eeec35.png" height="16.42px"> app on your device.
2. Tap the Home tab, then tap <img src="https://user-images.githubusercontent.com/3979615/78010869-9aed1380-738e-11ea-9644-9f46b3633026.png" height="16.42px">.
3. Tap *Add Accessory*, and select *I Don't Have a Code or Cannot Scan*.
4. Select the Russound for pairing.
5. Enter the Homebridge PIN, this can be found under the QR code in Homebridge UI or your Homebridge logs, alternatively you can select *Use Russound* and scan the QR code again.

### Feature Options
Feature options allow you to enable or disable certain features in this plugin. There are plugin-wide feature options, and some that are specific to individual Controllers.


Platform-level configuration parameters:

| Fields                 | Description                                             | Default                                                                               | Required |
|------------------------|---------------------------------------------------------|---------------------------------------------------------------------------------------|----------|
| platform               | Must always be `Russound`.                              |                                                                                       | Yes      |
| name                   | Name to use for the Russound platform.                  |                                                                                       | No       |
| debug                  | Enable debug logging.                                   | false                                                                                 | No       |

`controllers` configuration parameters:

| Fields                 | Description                                             | Default                                                                               | Required |
|------------------------|---------------------------------------------------------|---------------------------------------------------------------------------------------|----------|
| name                   | Name to use for this Russound Controller.               | MCA-88X                                                                               | No       |
| ip                     | IP address of your Russound Controller.                 |                                                                                       | Yes      |
| zones                  | Number of zones to register. Max 6                      | 6                                                                                     | No       |
| sources                | Number of sources to assign. Max 6                      | 6                                                                                     | No       |


## Credits
