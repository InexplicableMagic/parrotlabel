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
				if( image_directory != "." && image_directory != "")
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
	let image_name = path.posix.basename( flist_item.path );

	//Only export if there are some labelling boxes and the image width and height are present
	if( 'image_width' in flist_item.labelling_state && 
	    'image_height' in flist_item.labelling_state && 
	     flist_item.labelling_state.box_list.length > 0){
		let imgWidth = flist_item.labelling_state.image_width;
		let imgHeight = flist_item.labelling_state.image_height;

		let pascal_obj = {
			"annotation" : {
				"filename": image_name,
				"path": flist_item.path,
				"size" : {
					"width": imgWidth,
					"height" : imgHeight,
					"depth": 3	//Fix the depth as always 24-bit colour. Can't actually get this easily. Not sure if anything uses it
				},
				"object" : []
			}
		}

		for(const box of flist_item.labelling_state.box_list){
			let xmin = Math.round((imgWidth-1) * box.leftPct)
			let boxWidth = Math.round((imgWidth) * box.widthPct)
			let ymin = Math.round((imgHeight-1) * box.topPct)
			let boxHeight = Math.round((imgHeight) * box.heightPct)
			let xmax = xmin+boxWidth;
			let ymax = ymin+boxHeight;

			let object = {
				"name": box.label,
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

	return { "success": true }
	
}

module.exports = { pascalVOCExport  }
