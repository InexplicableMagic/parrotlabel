const {app, BrowserWindow, ipcMain, dialog, Menu} = require('electron') 
const url = require('url') 
const path = require('path')
var fs = require('fs');
const util = require('util')
const iafsUtils = require ('./js/iafsUtils.js')

const {
  Worker, isMainThread, parentPort, workerData
} = require('worker_threads');




let mainWindow;
var saveFileName = "";
var needsSave = false;	//If the state has changed and a save is needed
//A unique value to identify this format not likely to collide with any other app
const formatMagicNumber = "43a04f6d-f95b-41da-8b92-f4c9f859d3fb";

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
	pathname: path.join(__dirname, 'labeller.html'), 
	protocol: 'file:', 
	slashes: true
	})) 

	var menu = Menu.buildFromTemplate([
	{
	  label: 'File',
	  submenu: [
		{label:'New'},
		{type: 'separator' },
		{label:'Save', click() {  saveMenu(); },accelerator: 'CmdOrCtrl+S' },
		{label:'Save As...', click() {  saveMenu(true); } },
		{type: 'separator' },
		{label:'Exit', click() { checkSaveOnExit(); } }
	  ]
	},
	{
	  label: 'Edit',
	  submenu: [
		{label:'Duplicate Selected Box', click() { mainWindow.webContents.send("labeller:duplicateSelectedBox");  }, accelerator: 'CmdOrCtrl+D' },
		{label:'Delete Boxes by Category...', click(){ mainWindow.webContents.send("labeller:deleteBoxesByCategory"); } },
		{type: 'separator' },
		{label:'New Box Category...', click() { mainWindow.webContents.send("labeller:newBoxCategory");  }, accelerator: 'CmdOrCtrl+G' },
		{label:'Rename Box Category...', click(){ mainWindow.webContents.send("labeller:renameBoxCategory"); } },
		{label:'Repopulate All Missing Box Categories', click() { mainWindow.webContents.send("labeller:appendAllBoxCategories", getAllBoxCategories() );  } },
	  ]
	},
	{
	  label: 'View',
	  submenu: [
		{label:'Fit To Window', click(){ mainWindow.webContents.send("labeller:menuFitToWindow");},accelerator: 'CmdOrCtrl+W'},
		{label:'Original Size', click(){ mainWindow.webContents.send("labeller:menuOriginalSize");},accelerator: 'CmdOrCtrl+O' },
		{label:'Fixed Width', click(){ mainWindow.webContents.send("labeller:menuStickyZoom"); },accelerator: 'CmdOrCtrl+M'},
		{type: 'separator' },
		{label:'Zoom In', click(){ mainWindow.webContents.send("labeller:menuZoomIn"); },accelerator: 'CmdOrCtrl+='  },
		{label:'Zoom Out', click(){ mainWindow.webContents.send("labeller:menuZoomOut"); },accelerator: 'CmdOrCtrl+-'},
		{type: 'separator' },
		{label:'Hide/Show Labels', click(){ mainWindow.webContents.send("labeller:hideShowLabels"); },accelerator: 'CmdOrCtrl+L'},
	  ]
	},
	{
	  label: 'Debug',
	  submenu: [
		{label:'Debug Tools', click(){ mainWindow.openDevTools();},accelerator: 'CmdOrCtrl+Shift+I' },
	  ]
	},

	])
	Menu.setApplicationMenu(menu);

	mainWindow.webContents.once('dom-ready', () => {  
		mainWindow.webContents.send('labeller:inialiseBoxCategoryList', category_meta_data); 
		switchImage(cur_image); 
	});

}

function createConfigWindow() { 
   mainWindow = new BrowserWindow(
	{
	width: 800, 
	height: 800,
	webPreferences: {
      		nodeIntegration: true,
      		contextIsolation: false,
	      	enableRemoteModule: true,
	    },
	}) 
   mainWindow.loadURL(url.format ({ 
      pathname: path.join(__dirname, 'config.html'), 
      protocol: 'file:', 
      slashes: true
   })) 
}

app.on('ready',function(){

	createConfigWindow();
	
	/*createLabellerWindow()
	mainWindow.webContents.send('labeller:switchImage', file_list[cur_image] );*/
	
});

ipcMain.on('app:configDone', (event, arg) => {
	
	if( "includeNewImages" in arg ){
		if( arg.includeNewImages == false )
			removeUnreferencedImages();
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

//Store the stae of the labelling on the current image
ipcMain.on('app:preserveState', (event, arg) => {
	let localLabellingState = arg.labelling_state
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
			save();
			mainWindow.close();
			break;
	}
});


//Cause the labelling window to switch to the next image



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
	mainWindow.webContents.send('labeller:switchImage', file_list[imageNumber] );
}


//Generic menthod to pop-up a directory selection dialogue and return the user selection
//Does not allow files to be selected
ipcMain.on('app:getImagesDir', (event, arg) => {

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

//Set the validated loaded labelling data globally to avoid reloading it
function setLabellingLoadedFromFile( loaded_labelling ){
	loaded_labelling_file_content = loaded_labelling
	
}

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

	const worker = new Worker(`
		const iafsUtils = require ('./js/iafsUtils.js');
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

	console.dir( file_list );

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
			all_categories[ urrentlyOnScreen[i] ]=1;
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
	event.reply(arg.replyto, getAllBoxCategories() );
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




function convertPctToAbsolutePixels( imgWidth, imgHeight, box_list ){
	output = []
	
	for(let i=0;i<box_list.length;i++){
		
	}

	return output;

}

function checkSaveOnExit(){

	if(needsSave){
		let response = dialog.showMessageBoxSync( { "message": "Save changes?", "buttons": [ "Yes", "No" ], "defaultId": 0   }  )
		if( response == 0 ){
			saveMenu(false,true);
			return;
		} 
	}

	mainWindow.close();
		
}

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
function saveMenu(saveAs=false, quit=false){
	if(saveFileName == "" || saveAs){
		const savePath = dialog.showSaveDialogSync(null);
		if( savePath == undefined )
			return;
		if( iafsUtils.fileExists( savePath ) ){
			let response = dialog.showMessageBoxSync( { "message": "Overwrite existing file?", "buttons": [ "Cancel", "Yes" ], "defaultId" : 0  }  )
			if( response != 1 )
				return;
		}

		saveFileName = savePath;
	}

	
	//Ask the renderer to preserve the state of the current image being labelled and then it calls back to actually do the save
	if( quit )
		mainWindow.webContents.send("labeller:saveAndQuit")
	else
		mainWindow.webContents.send("labeller:save")
}

function save( filename=saveFileName ){
	o = { 
		"file_format" : {
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
			console.log('Error writing file: ${err}');
		    } else {
			console.log('File is written successfully!');
	    	}
	});

	needsSave = false;

	
}



