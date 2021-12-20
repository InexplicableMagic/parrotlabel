function showExportDiv(){
	if(!modalCurrentlyOnScreen){
		modalCurrentlyOnScreen = true;
		hotKeysEnabled = false;
		document.getElementById("exportDiv").style.visibility = "visible";
	}
}

function setPascalExportDir(){
	ipcRenderer.send('app:getDirSelection', { "replyto": "export:setPascalExportPath" });
}

ipcRenderer.on('export:setPascalExportPath', (event, arg) => {
	if(arg.length > 0){
		let paths = document.getElementById("pascalDIR");
		paths.innerHTML = arg[0];
		lastValidDirectory = arg[0];
	}		
});


function handleExportDialogue(){
	if(document.getElementById("pascalVOCExportRadio").checked)
		doPascalVOCExport();	
}

function doPascalVOCExport(){
	let paths = document.getElementById("pascalDIR").innerHTML;
	ipcRenderer.send('app:pascalVOCExport', {"dir": paths } );
	closeExportDialogue();
}

function closeExportDialogue(){
	modalCurrentlyOnScreen = false;
	hotKeysEnabled = true;
	document.getElementById("exportDiv").style.visibility = "hidden";
}
