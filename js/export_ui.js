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
	if(document.getElementById("pascalVOCExportRadio").checked)
		doPascalVOCExport();	
}

function doPascalVOCExport(){
	let paths = document.getElementById("pascalDIR").innerHTML;
	ipcRenderer.send('app:preserveState', { "command": "pascalVOCExport", "labelling_state": getFullLabellingState(), "dir": paths } );
	closeExportDialogue();
}

function closeExportDialogue(){
	modalCurrentlyOnScreen = false;
	hotKeysEnabled = true;
	document.getElementById("exportDiv").style.visibility = "hidden";
}
