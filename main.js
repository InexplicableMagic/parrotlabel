const {app, BrowserWindow, ipcMain, dialog, Menu} = require('electron') 
const url = require('url') 
const path = require('path')
var fs = require('fs');
const util = require('util')
const iafsUtils = require ('./js/iafsUtils.js')
const pvoc = require ('./js/pascalVOCExport.js')
const csve = require ('./js/csvExport.js')

const {
  Worker, isMainThread, parentPort, workerData
} = require('worker_threads');


var mainWindow;
var exportWindow;
var saveFileName = "";
var needsSave = false;	//If the state has changed and a save is needed
//A unique value to identify this format not likely to collide with any other app
const formatMagicNumber = "43a04f6d-f95b-41da-8b92-f4c9f859d3fb";
const formatName = "ParrotLabel";

var loaded_labelling_file_content = undefined;
var base_image_directory = "";
var cur_image = 0;			//Index of the current image
var category_meta_data = [];

var file_list = [];			//The full current state of the labelling

var lastBrowsedDirectory = "";	//Last directory used in the open dialogue


function createLabellerWindow() { 

	mainWindow = new BrowserWindow(
	{
	width: 1200, 
	height: 900,
	webPreferences: {
		nodeIntegration: true,
		contextIsolation: false,
	      	enableRemoteModule: true,
	    },
	}) 
	mainWindow.loadURL(url.format ({ 
	pathname: path.join(__dirname, 'html/labeller.html'), 
	protocol: 'file:',
	slashes: true
	})) 

	var menu = Menu.buildFromTemplate([
	{
	  label: 'File',
	  submenu: [
		{label:'New', click() {  checkSaveOnExit(true); } },
		{type: 'separator' },
		{label:'Save', click() {  saveMenu(); },accelerator: 'CmdOrCtrl+S' },
		{label:'Save As...', click() {  saveMenu(true); } },
		{label:'Export...', click() {  mainWindow.webContents.send("labeller:menuExport") } },
		{type: 'separator' },
		{label:'Exit', click() { checkSaveOnExit(); } }
	  ]
	},
	{
	  label: 'Edit',
	  submenu: [
		{label:'Remove Current Image', click() { removeCurrentImage(); }, accelerator: 'CmdOrCtrl+R' },
		{type: 'separator' },
		{label:'Duplicate Selected Box', click() { mainWindow.webContents.send("labeller:duplicateSelectedBox");  }, accelerator: 'CmdOrCtrl+D' },
		{label:'Delete Boxes by Category...', click(){ mainWindow.webContents.send("labeller:deleteBoxesByCategory"); } },
		{type: 'separator' },
		{label:'New Box Category...', click() { mainWindow.webContents.send("labeller:newBoxCategory");  }, accelerator: 'CmdOrCtrl+T' },
		{label:'Rename Box Category...', click(){ mainWindow.webContents.send("labeller:renameBoxCategory"); } },
		{label:'Repopulate All Missing Box Categories', click() { mainWindow.webContents.send("labeller:appendAllBoxCategories", getAllBoxCategories() );  } },
	  ]
	},
	{
	  label: 'Navigate',
	  submenu: [
		{label:'Next', click() { mainWindow.webContents.send("labeller:nextImage"); }, accelerator: 'CmdOrCtrl+Right' },
		{label:'Prev', click() { mainWindow.webContents.send("labeller:prevImage"); }, accelerator: 'CmdOrCtrl+Left' },
		{label:'Next Unlabelled', click() { switchNextImageNoBoxes(1); }, accelerator: 'CmdOrCtrl+N' },
		{label:'Prev Unlabelled', click() { switchNextImageNoBoxes(-1); }, accelerator: 'CmdOrCtrl+P' },
		{label:'First Image', click() { switchImage(0); } },
		{label:'Last Image', click() { switchImage( file_list.length -1 ); } },
		
	  ]
	},
	{
	  label: 'View',
	  submenu: [
		{label:'Fit To Window', click(){ mainWindow.webContents.send("labeller:menuFitToWindow");},accelerator: 'CmdOrCtrl+W'},
		{label:'Original Size', click(){ mainWindow.webContents.send("labeller:menuOriginalSize");},accelerator: 'CmdOrCtrl+O' },
		{label:'Fix Current Width', click(){ mainWindow.webContents.send("labeller:menuStickyZoom"); },accelerator: 'CmdOrCtrl+M'},
		{type: 'separator' },
		{label:'Zoom In', click(){ mainWindow.webContents.send("labeller:menuZoomIn"); },accelerator: 'CmdOrCtrl+Up'  },
		{label:'Zoom Out', click(){ mainWindow.webContents.send("labeller:menuZoomOut"); },accelerator: 'CmdOrCtrl+Down'},
		{type: 'separator' },
		{label:'Smooth Pixel Scaling', click(){ mainWindow.webContents.send("labeller:setSmoothPixels"); }  },
		{label:'Sharp Pixel Scaling', click(){ mainWindow.webContents.send("labeller:setSharpPixels"); }  },
		{type: 'separator' },
		{label:'Show/Hide Box Labels', click(){ mainWindow.webContents.send("labeller:hideShowLabels"); },accelerator: 'CmdOrCtrl+L'},
		{label:'Show/Hide Boxes', click(){ mainWindow.webContents.send("labeller:hideShowBoxes"); },accelerator: 'CmdOrCtrl+B'},
		{type: 'separator' },
		{label:'Show/Hide Image Path', click(){ mainWindow.webContents.send("labeller:showImagePaths"); },accelerator: 'CmdOrCtrl+I'},
	  ]
	},
	,
	{
	  label: 'Help',
	  submenu: [
		{label:'Quickstart Tutorial', click(){ helpWindow("help-quickstart.html", 900, 900); }},
		{label:'Keyboard Shortcuts', click(){ helpWindow("help-keyboard-shortcuts.html", 600, 400); }},
		{label:'File Format Description', click(){ helpWindow("help-file-format.html", 900, 900); }},
	  ]
	},

	/*{
	  label: 'Debug',
	  submenu: [
		{label:'Debug Tools', click(){ mainWindow.openDevTools();},accelerator: 'CmdOrCtrl+Shift+I' },
	  ]
	},*/

	])
	Menu.setApplicationMenu(menu);

	mainWindow.webContents.once('dom-ready', () => {  
		mainWindow.webContents.send('labeller:inialiseBoxCategoryList', category_meta_data); 
		switchImage(cur_image); 
	});

	mainWindow.on('close', function(e){
	   	if(needsSave){
			if( ! checkSaveOnExit() )
				e.preventDefault();
		}
    	});

}

function helpWindow(manual_page, widthSize, heightSize){
	let helpWindow = new BrowserWindow(
	{
	width: widthSize, 
	height: heightSize,
	webPreferences: {
		nodeIntegration: true,
		contextIsolation: false,
	      	enableRemoteModule: true,
	    },
	}) 
	helpWindow.loadURL(url.format ({ 
		pathname: path.join(__dirname, 'html/'+manual_page), 
		protocol: 'file:', 
		slashes: true
	}));

	helpWindow.removeMenu();
}


function createConfigWindow() { 
   mainWindow = new BrowserWindow(
	{
	width: 800, 
	height: 900,
	webPreferences: {
      		nodeIntegration: true,
      		contextIsolation: false,
	      	enableRemoteModule: true,
	    },
	}) 
   mainWindow.loadURL(url.format ({ 
      pathname: path.join(__dirname, 'html/config.html'), 
      protocol: 'file:', 
      slashes: true
   })) 

   mainWindow.removeMenu();
}

app.on('ready',function(){
	createConfigWindow();
});

ipcMain.on('app:configDone', (event, arg) => {
	
	if( "includeNewImages" in arg ){
		if( arg.includeNewImages == false )
			removeUnreferencedImages();
	}

	if( "excludeMissingImages" in arg ){
		if( arg.excludeMissingImages == true )
			removeMissingImages();
	}

	mainWindow.close();
	createLabellerWindow();

});

function removeUnreferencedImages(){
	for(let i = file_list.length-1; i>=0;i--){
		if( !("referenced" in file_list[i]) )
			file_list.splice(i,1);
	}
}

function removeMissingImages(){
	for(let i = file_list.length-1; i>=0;i--){
		if( "missing" in file_list[i] )
			file_list.splice(i,1);
	}
}

//Store the stae of the labelling on the current image
ipcMain.on('app:preserveState', (event, arg) => {

	let localLabellingState = arg.labelling_state

	//If the image failed to load in this session but the image width and height was known from a previous session where the image did load then retain it
	//Avoids losing the state on transient file system problems
	if( (!("image_width" in localLabellingState)) && ("image_width" in file_list[cur_image].labelling_state) ){
		if("image_height" in file_list[cur_image].labelling_state ){
			localLabellingState["image_width"] = file_list[cur_image].labelling_state.image_width;
			localLabellingState["image_height"] = file_list[cur_image].labelling_state.image_height;
		}
	}		


	file_list[cur_image].labelling_state = localLabellingState;

	switch(arg.command){
		case "nextImage":
			incrementImage(1);
			break;
		case "prevImage":
			incrementImage(-1);
			break;
		case "save":
			save();
			break;
		case "saveAndQuit":
			if(save())
				needsSave = false;
				mainWindow.close();
			break;
		case "saveAndNewSession":
			if(save())
				needsSave = false;
				startNewSession();
			break;
		case "pascalVOCExport":
			doPascalVOCExport(arg.dir);
			break;
		case "csvExport":
			doCSVExport(arg.savePath);
			break;
	}
});


//Cause the labelling window to switch to the next image

function removeCurrentImage(){
	if (file_list.length >= 2){
		let response = dialog.showMessageBoxSync( { "message": "Remove current image from session (does not delete image file)?", "buttons": [ "Yes", "No" ], "defaultId": 1   }  )
		if( response == 0 ){
			file_list.splice(cur_image,1);
			if( cur_image >= file_list.length )
				cur_image = file_list.length - 1;
			switchImage( cur_image )
		}
	}else
		dialog.showMessageBoxSync( { "message": "Cannot remove image from a set where only one image exists.", "buttons": [ "OK" ] } );
}

function incrementImage(direction){
	cur_image+=direction;
	if( cur_image > (file_list.length-1) )
		cur_image = (file_list.length-1);
	if( cur_image < 0 )
		cur_image = 0;

	switchImage( cur_image );
}
function switchImage(imageNumber){
	file_list[imageNumber].file_num = imageNumber;
	file_list[imageNumber].num_files = file_list.length;
	
	//Test if the image is available just before loading in case the file system state has changed
	let imgPath = path.join( base_image_directory, file_list[imageNumber].path );
	if( !iafsUtils.isFileReadable( imgPath ) ){
		file_list[imageNumber]["missing"] = true;
	}else{
		if( "missing" in file_list[imageNumber] )
			delete file_list[imageNumber].missing;
	}

	mainWindow.webContents.send('labeller:switchImage', file_list[imageNumber] );
}

function switchNextImageNoBoxes(direction){
	let nextImage = getNextImageNoBoxes(direction);
	if( nextImage >= 0 ){
		cur_image = nextImage
		switchImage( cur_image );
	}else
		dialog.showMessageBoxSync( { "message": "All images have box labels.", "buttons": [ "OK" ] } );
}

function getNextImageNoBoxes(direction){
	let i = cur_image;
	let tested = 0;
	while(tested <  file_list.length){
		if(direction > 0){
			i++;
			if( i >= file_list.length )
				i = 0;
		}else{
			i--;
			if( i < 0)
				i = file_list.length - 1;
		}

		if( file_list[i].labelling_state.box_list != undefined ){
			if( file_list[i].labelling_state.box_list.length < 1 )
				return i;
		}
		tested++;
		
	}

	return -1;
}	


//Generic menthod to pop-up a directory selection dialogue and return the user selection
//Does not allow files to be selected
ipcMain.on('app:getDirSelection', (event, arg) => {

	let options = { properties: ['openDirectory']  } 

	if(lastBrowsedDirectory != undefined && lastBrowsedDirectory != "" )
		if(iafsUtils.directoryIsReadable(lastBrowsedDirectory))
			options['defaultPath'] = lastBrowsedDirectory;

	let dir = dialog.showOpenDialog(mainWindow, options).then((data) => {
		//Post the path selected in the dialogue back to whatever destination is set in the "replyto" key
		 event.reply(arg.replyto, data.filePaths);
		 if( data.filePaths.length > 0 )
			lastBrowsedDirectory = data.filePaths[0];
	});

});

//Popup the save dialog
ipcMain.on('app:getSavePathSelection', (event, arg) => {

	const savePath = dialog.showSaveDialogSync(null);

	if( savePath == undefined ){
		event.reply(arg.replyto, { "pathChosen": false } );
		return;
	}

	if( iafsUtils.fileExists( savePath ) ){
		let response = dialog.showMessageBoxSync( { "message": "Overwrite existing file?", "buttons": [ "Cancel", "Yes" ], "defaultId" : 0  }  )
		if( response != 1 ){
			event.reply(arg.replyto, { "pathChosen": false } );
			return;
		}
	}

	event.reply(arg.replyto, { "pathChosen": true, "savePath": savePath } );


});

ipcMain.on('app:getJSONFile', (event, arg) => {
	
	let options = { "properties": ['openFile'], "title": "Select file to load:" } 

	if(lastBrowsedDirectory != undefined && lastBrowsedDirectory != "" )
		if(iafsUtils.directoryIsReadable(lastBrowsedDirectory))
			options['defaultPath'] = lastBrowsedDirectory;

	let fpath = dialog.showOpenDialog(mainWindow, options).then((data) => {
		//Post the path selected in the dialogue back to whatever destination is set in the "replyto" key
		 event.reply(arg.replyto, data.filePaths);
		if( data.filePaths.length > 0 )
			lastBrowsedDirectory = path.dirname(data.filePaths[0]);
	});


});



function readJSONFile(fpath){
	return new Promise(function(resolve, reject) {
		fs.readFile(fpath, 'utf8', (err, data) => {
			if (err) {
				console.log(`Error reading file from disk: ${err}`);
				reject(""+err);
	    		} else {
				try{
					const labelling_file = JSON.parse(data);
					resolve(labelling_file);
				}catch(err){
					reject("Could not parse file as valid JSON: "+err);
				}
			}
		});
	});
}


//Test that flie format looks roughly correct
function verifyFormat(labelling_file) {
	return new Promise(function(resolve, reject) {
		if( "file_format" in labelling_file ){
			file_format = labelling_file.file_format;
			if( "magic" in file_format ){
				if(file_format.magic == formatMagicNumber){
					if( "version" in file_format ){
						let image_dir_base_path = ""
						if( "config" in labelling_file ){
							if( "image_dir_base_path" in labelling_file.config ){
								image_dir_base_path = labelling_file.config.image_dir_base_path;
							}
							if( "category_meta_data" in labelling_file.config ){
								category_meta_data = labelling_file.config.category_meta_data;
							}
							
						}
						resolve(image_dir_base_path);
					}else
						reject("Invalid file format - missing version key under file_format key");		
				}else
					reject("Invalid file format - wrong UUID in magic field.");	
			}else
				reject("Invalid file format - file_format.magic key missing.");
				
		}else{
			reject("Invalid file format - file_format key missing.");
		}
	});
}

function loadMarkingFile(labelling_file, image_dir_base_path){
	return new Promise(function(resolve, reject) {
		if( "labels" in labelling_file ){
			
		}else{
			reject("Failed to find labels key in JSON file.")
		}
	});
}

ipcMain.on('app:testDirectoryReadable', (event, arg) => {
	
	if( iafsUtils.directoryIsReadable( arg.dir ) ){
		event.reply(arg.replyto, {"readable": true, "dir" : arg.dir } );
	}else{
		event.reply(arg.replyto, {"readable": false, "dir" : arg.dir } );
	}
});

ipcMain.on('app:testDirectoryWritable', (event, arg) => {
	if( iafsUtils.directoryIsWritable( arg.dir ) ){
		event.reply(arg.replyto, {"writable": true, "dir" : arg.dir } );
	}else{
		event.reply(arg.replyto, {"writable": false, "dir" : arg.dir } );
	}
});

//Set the validated loaded labelling data globally to avoid reloading it
function setLabellingLoadedFromFile( loaded_labelling ){
	loaded_labelling_file_content = loaded_labelling
}

//Restart with a new session
ipcMain.on('app:resetLoadedLabellingFile', (event, arg) => {
	loaded_labelling_file_content = undefined;
	file_list = [];
});

function setbaseImageDirectory( base_dir ){
	base_image_directory = base_dir;
}

ipcMain.on('app:setBaseImageDirectory', (event, arg) => {
	setbaseImageDirectory( arg.dir );
});

//Confirm the path supplied points to a valid labelling file that is readable
//Returns errors and also tries to suggest an image file directory
ipcMain.on('app:testJSONFileFormatState', (event, arg) => {
	if( ! iafsUtils.isFileReadable( arg.path ) ){
		event.reply(arg.replyto, {"valid": false, "path" : arg.path, "error": "File not readable" } );
	}else{
		readJSONFile( arg.path ).then( (labelling_file)=> {
			verifyFormat( labelling_file ).then( (image_dir_base_path)=> {
				const removeFilePart = dirname => path.parse(dirname).dir
				let json_enclosing_directory = removeFilePart( arg.path );
				//If there's no absolute directory set for the images directory then default to directory the JSON file is in
				if( image_dir_base_path == "" ){
					image_dir_base_path = json_enclosing_directory;
				}else{
					//If the base path is absolute but not readable - default to the directory containing the JSON
					if( path.isAbsolute(image_dir_base_path) ){
						if( !iafsUtils.directoryIsReadable( image_dir_base_path ) ){
							image_dir_base_path = json_enclosing_directory;
						}
					}else{
						//If the path is relative, then make it default to relative to the JSON file
						let joined_path = path.join( json_enclosing_directory, image_dir_base_path );
						if( iafsUtils.directoryIsReadable( joined_path ) ){
							image_dir_base_path = joined_path;
						}else{
							image_dir_base_path = json_enclosing_directory;
						}
					}
				}

				image_dir_base_path = path.normalize( image_dir_base_path );
				
				event.reply(arg.replyto, {"valid": true, "path" : arg.path, "error": "", "image_dir_base_path": image_dir_base_path } );
				setLabellingLoadedFromFile( labelling_file );

				saveFileName = arg.path;		//Save changes back to the same file name
			}).catch((err)=>{
				event.reply(arg.replyto, {"valid": false, "path" : arg.path, "error": err } );	
			});			

		}).catch( (err) => {
			event.reply(arg.replyto, {"valid": false, "path" : arg.path, "error": err } );
		});
	}
});

//Start a parallel process to scan the file system from the specified images directory
ipcMain.on('app:initialiseLabellingState', (event, arg) => {

	//Get round the problem that the worker thread cannot find the "iafsUtils" dependendency when inside an ASAR file
	//The build makes a copy of the file outside the ASAR archive and then this code finds which directory it was copied it
	//This path is then passed into the worker for it to include
	let resourceDir = path.normalize(__dirname);
	if( (!iafsUtils.directoryIsReadable( resourceDir )) && resourceDir.endsWith( '.asar' ) )
		resourceDir = path.dirname( resourceDir )
	let iafsUtilsPath = path.normalize(path.join(resourceDir,'js/iafsUtils.js'))
	let escaped = iafsUtilsPath.replaceAll('\\','\\\\');	//Escape slashes for windows builds

	const worker = new Worker(
		'const iafsUtilsPath="'+escaped+'"'+
		`
		const iafsUtils = require (iafsUtilsPath);
		const { parentPort } = require('worker_threads');
		function processMessage(message){
			let base_image_directory = message.base_image_directory;
			let loaded_labelling_file_content = message.labelling_state;
			let all_images_labelled = iafsUtils.initialise_labelled_state( base_image_directory, loaded_labelling_file_content );
			
			parentPort.postMessage( all_images_labelled );
		}

		parentPort.once('message',processMessage );  
	`, { eval: true }
	);
	worker.on('message',initialiseLabellingStateDone);

	worker.postMessage({ "base_image_directory": base_image_directory, "labelling_state": loaded_labelling_file_content });  
	
});

//Message received when file system scanning for images is done
function initialiseLabellingStateDone(message){

	let all_images_labelled = message;
	
	file_list = all_images_labelled.file_list;

	//Restore the position to the last image being viewed if a previous labelling file has been loaded
	cur_image = 0;
	if( (loaded_labelling_file_content != undefined) && ("path_last_image_viewed" in loaded_labelling_file_content.config) ){
		let fpath = loaded_labelling_file_content.config.path_last_image_viewed;
		let pathIndex = findExactFilePath( fpath );
		if(pathIndex >= 0)
			cur_image = pathIndex;			
	}

	mainWindow.webContents.send( 'config:fileMetadataResponse', all_images_labelled.meta_data );
	
}


//Delete all instances of boxes in a category 
ipcMain.on('app:DeleteAllInstancesOfBoxCategory', (event, arg) => {
	for(let i=0;i<file_list.length;i++){
		if("labelling_state" in file_list[i]){
			let labelling_state = file_list[i].labelling_state;
			if("box_list" in labelling_state){
				let retainedBoxes = []
				for(let j=0;j<labelling_state.box_list.length;j++){
					if( labelling_state.box_list[j].label != arg.catname )
						retainedBoxes.push( labelling_state.box_list[j] );
				}
				labelling_state.box_list = retainedBoxes;
			}
		}
	}
	needsSave = true;
		
		
});

function getAllBoxCategories(currentlyOnScreen){
	let all_categories = {}

	if(currentlyOnScreen != undefined){
		for(let i=0;i<currentlyOnScreen.length;i++)
			all_categories[ currentlyOnScreen[i] ]=1;
	}

	for(let i=0;i<file_list.length;i++){
		if("labelling_state" in file_list[i]){
			let labelling_state = file_list[i].labelling_state;
			if("box_list" in labelling_state){
				for(let j=0;j<labelling_state.box_list.length;j++){
					all_categories[labelling_state.box_list[j].label] = 1;
				}
			}
		}
	}
	
	let sorted_cat_list = Object.keys(all_categories);
	sorted_cat_list.sort();

	return sorted_cat_list;
}

ipcMain.on('app:GetAllBoxCategories', (event, arg) => {
	event.reply(arg.replyto, getAllBoxCategories(arg.currentlyOnScreen) );
});

ipcMain.on('app:RenameBoxCategoryGlobally', (event, arg) => {
	if( arg.fromLabel != undefined &&  arg.toLabel != undefined){
		for(let i=0;i<file_list.length;i++){
			if("labelling_state" in file_list[i]){
				let labelling_state = file_list[i].labelling_state;
				if("box_list" in labelling_state){
					for(let j=0;j<labelling_state.box_list.length;j++){
						if( labelling_state.box_list[j].label == arg.fromLabel )
							labelling_state.box_list[j].label  = arg.toLabel;
					}
				}
			}
		}
	}
	needsSave = true;
});

//Notify that the state has changed and a save would be required if the app exist
ipcMain.on('app:needsSave', (event, arg) => {
	needsSave = true;
});

ipcMain.on('app:SyncListedCategoryMetadata', (event, arg) => {
	category_meta_data = arg;
});


function checkSaveOnExit(newSession=false){

	if(needsSave){
		let response = dialog.showMessageBoxSync( { "message": "Save changes?", "buttons": [ "Yes", "No", "Cancel" ], "defaultId": 0   }  )
		if( response == 0 ){
			return saveMenu(false,true,newSession);
		}else if (response == 1){
			needsSave = false;
			if( newSession )
				startNewSession();
			else
				mainWindow.close();
		}else if(response == 2){
			return false;
		}
	}else{
		if( newSession )
			startNewSession();
		else
			mainWindow.close();
	}

	return true;
		
}

function startNewSession(){
	needsSave = false;
	loaded_labelling_file_content = undefined;
	base_image_directory = "";
	cur_image = 0;
	category_meta_data = [];
	file_list = [];
	saveFileName = "";

	mainWindow.close();
	createConfigWindow();
}


//locate an exact (relative) path within the set of files being labelled
function findExactFilePath(fpath){
	if(fpath == undefined || fpath == "")
		return -1;

	for(let i=0;i<file_list.length;i++){
		if(file_list[i].path == fpath)
			return i;
	}
	return -1;
}

//Popup the save dialog
function saveMenu(saveAs=false, quit=false, newSession=false){
	if(saveFileName == "" || saveAs){
		const savePath = dialog.showSaveDialogSync(null);
		if( savePath == undefined )
			return false;
		if( iafsUtils.fileExists( savePath ) ){
			let response = dialog.showMessageBoxSync( { "message": "Overwrite existing file?", "buttons": [ "Cancel", "Yes" ], "defaultId" : 0  }  )
			if( response != 1 )
				return false;
		}

		saveFileName = savePath;
	}

	
	//Ask the renderer to preserve the state of the current image being labelled and then it calls back to actually do the save
	if( newSession )
		mainWindow.webContents.send("labeller:saveAndNewSession")
	else if( quit )
		mainWindow.webContents.send("labeller:saveAndQuit")
	else
		mainWindow.webContents.send("labeller:save")
	

	return true;
}

function save( filename=saveFileName ){
	o = { 
		"file_format" : {
			"name" : formatName,
			"magic" : formatMagicNumber,
			"version" : 1
		},

		"config" : {
			"image_dir_base_path": base_image_directory,
			"category_meta_data": category_meta_data,
			"path_last_image_viewed": file_list[ cur_image ].path
		},

		"labels" : [ ] 
	    };

	for(let i=0;i<file_list.length;i++){
		if("labelling_state" in file_list[i]){
			let labelling_state = file_list[i].labelling_state;
			let this_label = {}
			if( "image_width" in labelling_state && "image_height" in labelling_state ){
				this_label[ "image_width" ] = labelling_state.image_width;
				this_label[ "image_height" ] = labelling_state.image_height;
			}
			this_label[ "image_path" ] = file_list[i].path;

			if("box_list" in labelling_state){
				this_label["box_list"] = labelling_state.box_list;
			
			}

			o.labels.push( this_label );		
		}
	}
	

	const data = JSON.stringify(o);
	fs.writeFileSync( filename , data, 'utf8', (err) => {
	    	if (err) {
			dialog.showMessageBoxSync( { "message": "Error saving: "+err, "buttons": [ "OK" ] } );
			return false;
		}
	    	
	});

	needsSave = false;
	return true;
	
}

function doPascalVOCExport(dir) {
	let result = pvoc.pascalVOCExport( dir, file_list );
	if( "error" in result ){
		dialog.showMessageBoxSync( { "message": "Error exporting: "+result.error, "buttons": [ "OK" ] } );
	}
}

function doCSVExport(path){
	let result = csve.csvExport( path, file_list );
	if( "error" in result ){
		dialog.showMessageBoxSync( { "message": "Error exporting: "+result.error, "buttons": [ "OK" ] } );
	}
}





