const path = require('path')
var fs = require('fs');
const iafsUtils = require ('./iafsUtils.js')
const object2xml = require('object-to-xml');

function pascalVOCExport( export_dir, file_list ){
	if(iafsUtils.directoryIsWritable(export_dir)){
		for(let i=0;i<file_list.length;i++){
			if( (file_list[i].path != undefined) && (file_list[i].path != "") ){
				let image_directory = path.dirname( file_list[i].path );
				let image_name = path.posix.basename( file_list[i].path );


				let full_image_dir = export_dir	//Path where we need to write the XML
				if( image_directory != "." && image_directory != "" )
					full_image_dir = path.join( export_dir, image_directory );
			
				let image_name_sans_ext = path.parse(image_name).name;
				if( image_name_sans_ext != "" ){
					let xml_name = image_name_sans_ext+".xml"; 
					if( !iafsUtils.directoryIsReadable( full_image_dir )){
						fs.mkdirSync( full_image_dir, { "recursive": true } )	
					}

					let final_export_fpath = path.join( full_image_dir, xml_name );
					let result = exportLabellingAsPascalVOC( final_export_fpath, file_list[i]  );
					if( "error" in result )
						return result;
					
				}
			}
		}
	}

	return { "success": true };
}

//original_image_name = image name without path
function exportLabellingAsPascalVOC( fpath, flist_item ){

	//Get the image name from the path
	let image_name = path.posix.basename( flist_item.path );

	//Locate name of the containing folder
	let containing_folder = path.dirname( flist_item.path );
	if( containing_folder == "." || containing_folder == "" )
			containing_folder = "";
	else{
		containing_folder = path.posix.basename( containing_folder );
		if( containing_folder == "." || containing_folder == "" )
			containing_folder = "";
	}
	

	//Only export if there are some labelling boxes and the image width and height are present
	if( 'image_width' in flist_item.labelling_state && 
	    'image_height' in flist_item.labelling_state && 
	     flist_item.labelling_state.box_list.length > 0 ){
		let imgWidth = flist_item.labelling_state.image_width;
		let imgHeight = flist_item.labelling_state.image_height;

		//Only export if the image size is greater than zero
		if( imgWidth > 0 && imgHeight > 0 ){
			let pascal_obj = {
				"annotation" : {
					"folder": containing_folder,
					"filename": image_name,
					"path": flist_item.path,
					"source" : { "database": "IMAExport" },
					"size" : {
						"width": imgWidth,
						"height" : imgHeight,
						"depth": 3	//Fix the depth as always 24-bit colour. Can't actually get this easily. Not sure if anything uses it
					},
					"segmented" : 0,
					"object" : []
				}
			}

			for(const box of flist_item.labelling_state.box_list){
				//In Pascal VOC top left is registered to x = 1 y = 1
				//It's assumed the borders are inclusive
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

				let truncated = 0;
				//Assume if the image is on the edge of the screen then it may be truncated
				if( xmin < 2 || ymin < 2 || xmax >= imgWidth || ymax >= imgHeight )
					truncated = 1;

				//Catch precision errors
				if(xmax > imgWidth)
					xmax = imgWidth;
				if(ymax > imgHeight)
					ymax = imgHeight;

				let object = {
					"name": box.label,
					"pose": "Unspecified",
					"truncated": truncated,
					"difficult" : 0,
					"bndbox": { "xmin": xmin, "ymin": ymin, "xmax": xmax, "ymax": ymax }
				}

				pascal_obj.annotation.object.push( object );	
			}
		

			let xml_string = object2xml(pascal_obj);
			fs.writeFileSync( fpath , xml_string, 'utf8', (err) => {
			    	if (err) {
					return( { "error": 'Error writing file: ${err}' } );
				}
			    	
			});
		}
	}

	return { "success": true }
	
}

module.exports = { pascalVOCExport  }
