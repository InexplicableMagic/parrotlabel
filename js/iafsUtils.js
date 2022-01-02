const path = require('path')
var fs = require('fs');

//If a file has an extension typical of an image file
function hasImageExtension( filePath ){

	const valid_image_exts = [ ".jpg", ".jpeg", ".gif", ".png", ".webp" ];

	let extname = path.extname( filePath );
	if( extname == "" )
		return false;
	if( valid_image_exts.indexOf(extname.toLowerCase()) == -1 )
		return false;
	
	return true;
	

}

function directoryIsReadable(dir){
	
	if( ! fs.existsSync(dir) )
		return false;
	try{ 
		fs.accessSync(dir, fs.constants.R_OK );
	}catch(err){
		return false;
	}
	if( ! fs.statSync(dir).isDirectory()){
		return false;
	}
	return true;
}

function directoryIsWritable(dir){
	
	if( ! fs.existsSync(dir) )
		return false;
	try{ 
		fs.accessSync(dir, fs.constants.W_OK );
	}catch(err){
		return false;
	}
	if( ! fs.statSync(dir).isDirectory()){
		return false;
	}
	return true;
}

function isFileReadable(file){
	
	if( file===undefined || file == "" )
		return false;

	if( ! fs.existsSync(file) )
		return false;
	try{ 
		fs.accessSync(file, fs.constants.R_OK );
	}catch(err){
		return false;
	}
	if( ! fs.statSync(file).isFile()){
		return false;
	}
	return true;
}

function fileExists(file){
	if( file===undefined || file == "" )
		return false;
	if( fs.existsSync(file) ){
		return true;
	}
	return false;
	
}

function * getAllImagesInDirSubGen( base_path, sub_dir ){
	let absolute_dir = base_path;
	if( sub_dir != undefined )
		absolute_dir = path.join( base_path, sub_dir );
	let files = fs.readdirSync(absolute_dir);

	for(let i=0;i< files.length; i++){
		let absolute_fpath = path.join( absolute_dir, files[i] )

		if( isFileReadable(absolute_fpath) ){
			if( hasImageExtension( files[i] ) ){
				let fname = files[i];
				if( sub_dir != undefined )
					fname = path.join( sub_dir, files[i] )
				yield fname;
			}
		}

		if( directoryIsReadable( absolute_fpath ) ){
			let relative_fpath = files[i];
			if( sub_dir != undefined )
				relative_fpath = path.join( sub_dir, files[i] );
			for( const fpath of getAllImagesInDirSubGen( base_path, relative_fpath )){
				yield fpath;
			}
		}
	}
}


//Get a listing of all image files in a directory and initialise the 
function getAllImages( base_path ){
	base_path = path.normalize( base_path );

	let file_listing = [];
	for(const fpath of getAllImagesInDirSubGen( base_path ))
		file_listing.push( fpath );
	
	file_listing.sort();

	let output_list = [];
	

	for(i=0;i<file_listing.length;i++){
		let relative_fpath = file_listing[i].replace('\\', '/');
		let absolute_url = 'file://'+path.join( base_path, relative_fpath );  
		output_list.push( generateEmptyFileObject( base_path, relative_fpath ) );
	}

	return output_list;
}

function generateEmptyFileObject( base_path, relative_fpath ){
	let slashCorrectedRelative = relative_fpath.replace('\\', '/');
	let absolute_url = 'file://'+path.join( base_path, slashCorrectedRelative )
	
	let obj = { 
			"path": slashCorrectedRelative, 
			"image_url": absolute_url, 
			"labelling_state" : { "box_list" : []  }
		  }
	return obj;
}

function initialise_labelled_state(base_path, labelling_state){
	let all_image_files = getAllImages( base_path );

	let number_of_files_in_images_directory = all_image_files.length;

	let file_name_dict = {};

	
		let images_from_labelling_file_in_collection = 0;
		let images_from_labelling_missing_from_collection = 0;
	
		for(let i=0;i<all_image_files.length;i++)
			file_name_dict[ all_image_files[i].path ] = i;
	
		if(labelling_state != undefined){

			for(let i=0;i<labelling_state.labels.length;i++){
				if( labelling_state.labels[i].image_path in file_name_dict ){
					all_image_files[ file_name_dict[ labelling_state.labels[i].image_path ] ]["referenced"] = true;
					images_from_labelling_file_in_collection++;
					all_image_files[ file_name_dict[ labelling_state.labels[i].image_path ] ].labelling_state.box_list = labelling_state.labels[i].box_list;
					if( ("image_width" in labelling_state.labels[i]) && ("image_height" in labelling_state.labels[i]) ){
						all_image_files[ file_name_dict[ labelling_state.labels[i].image_path ] ].labelling_state['image_width'] = labelling_state.labels[i].image_width;
						all_image_files[ file_name_dict[ labelling_state.labels[i].image_path ] ].labelling_state['image_height'] = labelling_state.labels[i].image_height;
					}

				}else{
					images_from_labelling_missing_from_collection++;
					let relative_fpath = labelling_state.labels[i].image_path;
					let newObj = generateEmptyFileObject( base_path, relative_fpath );
					newObj.labelling_state = labelling_state.labels[i];
					newObj["missing"] = true;
					all_image_files.push( newObj );
				}
			}



			return { "meta_data": {	"dir_total_images": number_of_files_in_images_directory,
				 		"images_found" : images_from_labelling_file_in_collection, 
				 		"missing_images": images_from_labelling_missing_from_collection }, 
				 "file_list": all_image_files
			};

		}else{
			//New labelling file
			return { "meta_data": {	"dir_total_images": number_of_files_in_images_directory },
				 "file_list": all_image_files
			};		

		}
}


module.exports = { initialise_labelled_state, hasImageExtension, getAllImages, getAllImagesInDirSubGen, directoryIsReadable, directoryIsWritable, isFileReadable, fileExists }
