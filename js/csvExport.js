const path = require('path')
var fs = require('fs');
const iafsUtils = require ('./iafsUtils.js')

function csvExport( export_path, file_list ){

	let output =  "filename,width,height,class,xmin,ymin,xmax,ymax\n";
	for(let i=0;i<file_list.length;i++){
		let flist_item = file_list[i];

		if( 'image_width' in flist_item.labelling_state && 
		    'image_height' in flist_item.labelling_state && 
		     flist_item.labelling_state.box_list.length > 0 ){
			let imgWidth = flist_item.labelling_state.image_width;
			let imgHeight = flist_item.labelling_state.image_height;

			//Only export if the image size is greater than zero
			if( imgWidth > 0 && imgHeight > 0 ){
				for(const box of flist_item.labelling_state.box_list){
					let xmin = Math.floor(imgWidth * box.leftPct)+1;
					let boxWidth = Math.round(imgWidth * box.widthPct)-1;
					let ymin = Math.floor(imgHeight * box.topPct)+1;
					let boxHeight = Math.round(imgHeight * box.heightPct)-1;
				
					if(boxWidth < 0)
						boxWidth = 0;
					if(boxHeight < 0)
						boxHeight = 0;
				
					let xmax = xmin+boxWidth;
					let ymax = ymin+boxHeight;

					line = [ flist_item.path,imgWidth,imgHeight,box.label,xmin,ymin,xmax,ymax ];
					output += line.join()+"\n";
				}
			}
		}
	}
	
	fs.writeFileSync( export_path , output, 'utf8', (err) => {
	    	if (err) {
			return( { "error": 'Error writing file: ${err}' } );
		}
	    	
	});

	return { "success": true };
}

module.exports = { csvExport }
