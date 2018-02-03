# Rembrandt - DRAFT
Is a contemporary open source implementation of photobooth software intended for use on a classic Van Gogh 'arcade' photobooth hardware, retrofitted with modern upgrades, such that:

The original 

 - coin reception
 - joystick and buttons
 - control board for the above
 - screen

are all retained, but the

 - computer
 - printer
 - camera

are updated in line with more modern standards.

The computer is upgraded to modern windows (we use Windows 7), a modern printer (we use <blah>), a modern camera (we use <xyz>).

## User experience

After being enticed by the decorative exterior to enter the photobooth and sit down, the user is presented with a non-touchscreen interface of the original screen, joystick and two buttons labelled "Ok" and "Back".

The user presses "Ok" while the take_photos panel is highlighted as available. A countdown begins. The user is shown a live video feed of the camera. When the countdown reaches zero, the current camera output is captured and the on-screen counter is decremented. When the counter reaches zero, the photos that were taken appear and a timer to printing completion is displayed along with the words "Time till completion".

The user is presented with options to select to publish the photos publicly on social media, if they select it then they are prompted to use an on-screen keyboard to enter their social media ID for that network. Once it is entered, the photos are posted from the configured account and targeted at that user by way of mention.

## Technology

Rembrandt uses 
 - html5 
 - CSS 
 - javascript
 - node
 - google chrome in kiosk mode

To operate the equipment and interface with the user. 

Specifically, a daemon (installed and running as a windows service) operates as monitor of the chrome instance that runs the user interface, and also monitors the serial port for incoming button presses and joystick movements, decoding and storing them for retrieval by the front-end. The daemon launches the web browser and provides web content to it via a local HTTP server, along with a json messaging service to notify of hardware events such as coin insert and button presses.

It stores all photos on a private S3 bucket and only publishes them to public social media upon the request of the user, and each time from the same accounts configured in the json configuration file.

The configuration file comes with all settings read and used from the file already set to a default value.

## Installation

Follow these steps, in order...

### OS

Firstly install your operating system. Install window 10 64-bit Enterprise with the following options:
 - DO NOT use express settings. Turn off all installation settings except for the last one about downloading windows updates faster.
 - Join local active directory domain (not Azure cloud!)
 - Not now, Cortana
When you get to the desktop
 - Yes you do want it discoverable via the network

### Application software

You must manually install:
 - Google Chrome
 - [testing only] If you're using a VM for testing rather than a real machine, install vmware tools using 'typical' settings
 - Set chrome to be the default browser
 - git for windows 2.15.1 from https://github.com/git-for-windows/git/releases/download/v2.15.1.windows.2/Git-2.15.1.2-64-bit.exe (all default options)
 - nodejs 8.9.4 (which includes npm 5.6.0) from https://nodejs.org/dist/v8.9.4/node-v8.9.4-x64.msi

You need to clone this repo via the command prompt:
```
cd Desktop
git clone https://github.com/grumpyoldgit/rembrandt.git
cd rembrandt
```

Then you need to install the modules that are needed for rembrandt to work. They are in the package.json file, and npm will install them for you by issuing the command:

```
npm install .
```

via the command line in the rembrandt directory that you moved into above.

### Apply Chrome group policy

Finally, you need to allow rembrandt to use the webcam on google chrome, so that users aren't prompted each time if they want to open the camera. To do that we use group policy as follows:
 - download https://dl.google.com/dl/edgedl/chrome/policy/policy_templates.zip
 - extract the file chrome.adm to the desktop from the folder adm/en-US/ within the zip file you just downloaded
 - Open gpedit.msc
 - Right click "Administrative Templates"
 - "Add/Remove Templates"
 - Add the template you just extracted ("chrome.adm")
 - Change the setting for "URLs that will be granted access to video devices without prompt" by adding the following URL:
  - http://127.0.0.1:3000/static/photobooth.html

Confirm that the setting has loaded into chrome by visiting chrome://policy

### Test the installation

You can test the installation without the serial interface using the following command:

```
node index.js test.serial
```

Allow access in the firewall dialog that pops up when the node application starts.

### Launch rembrandt

You can launch rembrandt with the following command:

```
node index.js
```

### Updating rembrandt

When new code is available on github in this repo, you can get the latest changes with two simple commands, executed in the rembrandt directory:

```
git pull
npm install .
```

## Other documentation

The manual for the original system is here http://www.segaarcade.com/__assets__/GamePDFs/Games/00093/van-gogh-manual.pdf it outlines the original system, hardware and ownership and maintenance procedures.




