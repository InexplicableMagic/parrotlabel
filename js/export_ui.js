




function showHideDivInline( divToShow, divsToHide ){
	for(theDiv of divsToHide)
		document.getElementById(theDiv).style.display = "none"
	document.getElementById(divToShow).style.display = "inline";
	
}

function showExportDiv(){
	if(!modalCurrentlyOnScreen){
		modalCurrentlyOnScreen = true;
		hotKeysEnabled = false;
		document.getElementById("exportDiv").style.visibility = "visible";
	}
}

function setPascalExportDir(){
	ipcRenderer.send('app:getDirSelection', { "replyto": "labeller:verifyPascalExportPath" });
}

ipcRenderer.on('labeller:verifyPascalExportPath', (event, arg) => {
	if(arg.length > 0){
		if(  arg[0] != "" ){
			document.getElementById("doExportButton").disabled = true;
			ipcRenderer.send('app:testDirectoryWritable', { "replyto": "labeller:setPascalExportPath", "dir": arg[0] } );
		}
	}	
});



ipcRenderer.on('labeller:setPascalExportPath', (event, arg) => {
	document.getElementById("pascalDIR").innerHTML = arg.dir;
	if(arg.writable){
		document.getElementById("pascalExportDirFeedback").innerHTML = "<font color=\"green\">&#10003;</font> Directory writable";
		document.getElementById("doExportButton").disabled = false;
	}else{
		document.getElementById("pascalExportDirFeedback").innerHTML = "<font color=\"red\">&#10060;</font> Directory not writable";
		document.getElementById("doExportButton").disabled = true;
	}
});


function handleExportDialogue(){
	if(document.getElementById("pascalVOCExportRadio").checked){
		doPascalVOCExport();
	}else{
		if(document.getElementById("csvExportRadio").checked)
		doCSVExport();
	}
	closeExportDialogue();
}

function setCSVSaveDirectory(){
	ipcRenderer.send('app:getSavePathSelection', { "replyto": "labeller:verifyCSVExportPath" });
}

ipcRenderer.on('labeller:verifyCSVExportPath', (event, arg) => {
	document.getElementById("csvFile").innerHTML = arg.savePath;
	if( arg.pathChosen ){
		document.getElementById("csvExportDirFeedback").innerHTML = "<font color=\"green\">&#10003;</font> Export file set";
		document.getElementById("doExportButton").disabled = false;
	}
});


function doPascalVOCExport(){
	let paths = document.getElementById("pascalDIR").innerHTML;
	ipcRenderer.send('app:preserveState', { "command": "pascalVOCExport", "labelling_state": getFullLabellingState(), "dir": paths } );
}

function doCSVExport(){
	let path = document.getElementById("csvFile").innerHTML;
	ipcRenderer.send('app:preserveState', { "command": "csvExport", "labelling_state": getFullLabellingState(), "savePath": path } )
}

function closeExportDialogue(){
	modalCurrentlyOnScreen = false;
	hotKeysEnabled = true;
	document.getElementById("exportDiv").style.visibility = "hidden";
}
