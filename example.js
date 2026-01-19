import '@mcpher/gas-fakes';

// we're using live apps script libraries as well!
if (ScriptApp.isFake) {
  // Load all libraries from the project manifest
  LibHandlerApp.load();
}


// just a utility to measure performance
class Timers {
  constructor() {
    this.timers = new Map()
  }
  start(label) {
    this.timers.set(label, new Timer(label))
  }
  end(label, message = '') {
    this.timers.get(label).end(message)
  }
}
class Timer {
  constructor(label) {
    this.label = label
    this.start = Date.now()
    console.log('...starting', this.label)
  }
  end(message = '') {
    const end = Date.now()
    console.log(`${this.label} finished after`, (end - this.start) / 1000, 's', message)
    return end - this.start
  }
}
const timers = new Timers()

// get all the folders we own
const enumerateFolders = () => {
  // we want to initially get all the known folders to prevent having to continually map them as we go
  // we're only interested in folders we own
  timers.start('getAllFolders')

  const folders = DriveApp.searchFolders(`trashed = false and 'me' in owners`)
  const folderMap = new Map()

  while (folders.hasNext()) {
    const advFolder = Drive.Files.get(folders.next().getId(), {
      fields: 'id,name,parents'
    });
    folderMap.set(advFolder.id, { id: advFolder.id, name: advFolder.name, parentId: advFolder.parents?.[0] })
  }
  timers.end('getAllFolders', `found ${folderMap.size} folders`)
  // just need to add the root folder
  const rootId = DriveApp.getRootFolder().getId()
  folderMap.set(rootId, { id: rootId, name: '', parentId: null, isRoot: true })

  // every parent mentioned should be found as a double check
  for (const folder of folderMap.values()) {
    if (folder.id === rootId) {
      if (folder.parentId) {
        throw new Error(`expected root folder ${rootId} to have no parent but found ${folder.parentId}`)
      }
    } else {
      if (!folder.parentId) {
        console.error(`expected folder ${folder.id} ${folder.name} to have a parent but found none`)
      }
      if (!folderMap.has(folder.parentId)) {
        console.error(`expected folder ${folder.id} ${folder.name}  to have a parent but found none in map`)
      }
    }
  }
  return folderMap

}

// get all the folders we own and build a path for each
const getAllFolders = () => {

  // all of them owner by me
  const folderMap = enumerateFolders()

  // now we know all the folders we can build a path for each 
  for (const folder of folderMap.values()) {
    const path = []
    let current = folder
    while (current.parentId) {
      const parent = folderMap.get(current.parentId)
      if (!parent) {
        console.log('...skipping folder', current.id)
        break
      }
      path.unshift(parent.name)
      current = parent
    }
    folder.path = path.join('/')
  }
  return folderMap
}

// these sheets will be used to store the results
const getFiddlers = () => {
  const SHEET_ID = '1CJjcBY17t2jdqP8LAJqe8jjje9ZcyuKtY0HJdCXgo2A'
  const SHEET_NAME_ALL = 'dedup-all'
  return {
    all: bmPreFiddler.PreFiddler().getFiddler({
      id: SHEET_ID,
      sheetName: SHEET_NAME_ALL,
      createIfMissing: true
    })
  }
}

const enumerateFiles = () => {

  // if we dont have a folder we are doing everything
  const root = DriveApp
  // get all the files but exclude google files which have no md5sum anyway
  const googleBase = 'application/vnd.google-apps.';
  const subTypes = [
    'document', 'spreadsheet', 'presentation', 'folder',
    'form', 'site', 'audio', 'video', 'photo', 'script',
    'drive-sdk', 'drawing', 'jam', 'map', 'vid', 'file',
    'unknown', 'fusiontable', 'mail-layout', 'kix',
    'ritz', 'punch', 'freebird', 'shortcut'
  ];

  // Map to full MIME type strings and format as "mimeType != '...'"
  const exclusions = subTypes
    .map(type => `mimeType != '${googleBase}${type}'`)
    .join(' and ');

  const finalQuery = `${exclusions} and  trashed = false and 'me' in owners`;
  return root.searchFiles(finalQuery);
}

// find duplicate content on drive by comparing their md5 checksums
// note this will fignore google files like sheets etc as they don't have md5 checksums
const getAllFiles = ({ max = Infinity } = {}) => {
  let count = 0
  let skipped = 0
  const fileMap = new Map()

  timers.start('getAllFiles')
  // get all the files and work through them
  const files = enumerateFiles()

  while (files.hasNext() && fileMap.size < max) {
    count++;
    const file = files.next();
    // we have to use the advanced drive service to get the md5 checksum
    const id = file.getId()
    const advfile = Drive.Files.get(id, {
      fields: 'md5Checksum,name,size,mimeType,parents,modifiedTime,createdTime'
    });

    // need to skip null md5 checksums as these are most likely zero size google files
    const { md5Checksum: md5, name, size, mimeType, parents, modifiedTime, createdTime } = advfile
    if (md5) {
      if (!fileMap.has(md5)) {
        fileMap.set(md5, []);
      }
      // if we dont own the file we wont get the parentsId
      fileMap.get(md5)
        .push({ id, name, size: parseInt(size, 10), mimeType, parentId: parents && parents[0], md5, modifiedTime, createdTime })
    } else {
      console.log('...skipping peculiar file of size', size, name, mimeType)
      skipped++
    }
  }
  timers.end('getAllFiles', `found ${count} files`)
  return { count, fileMap, skipped }
}


// organize dups for formatting
const formatDups = (dups, folderMap) => {
  timers.start('formatting')
  const form = dups.reduce((p, c) => {
    const md5 = c[0].md5
    p[md5] = {}
    const group = p[md5]
    for (const item of c) {

      // we'll set up the folderurl only once
      // we're trying to get the url of its parent.
      if (!item.parentUrl) {
        // 'orphaned' files will not have a parent - in the UI find with is:unorganized
        if (!item.parentId) {
          item.parentUrl = 'orphaned'
          item.parentName = 'orphaned'
        } else {
          const parentFolder = DriveApp.getFolderById(item.parentId)
          item.parentUrl = parentFolder ? parentFolder.getUrl() : 'couldnt find parent'
          item.parentName = parentFolder ? parentFolder.getName() : 'couldnt find parent'
        }
      }

      group[item.id] = {
        name: item.name,
        path: item.path,
        parentUrl: item.parentUrl,
        parent: item.parentName,
        id: item.id,
        parentId: item.parentId,
        size: item.size,
        mimeType: item.mimeType,
        modifiedTime: item.modifiedTime,
        createdTime: item.createdTime
      }
    }
    return p
  }, {})
  timers.end('formatting')
  return form
}

// color to separate dup groups
const formatSheet = (fiddler) => {

  timers.start('formatting sheet')
  // so now we can highlight the dups in the same color
  const colors = ["lightsalmon", "lightpink", "lightcoral", "lightyellow", "peachpuff", "lavender", "lightcyan", "lemonchiffon", "powderblue", "cornsilk","gainsboro"]

  let range = fiddler.getRange().offset(1, 0, fiddler.getNumRows(), fiddler.getNumColumns())
  const backgroundColors = fiddler.getData().map((row, i) => {
    return Array.from({ length: range.getNumColumns() })
      .fill(colors[row.index % colors.length])
  })


  if (backgroundColors.length) {
    range.setFontColor("black")
    range.setBackgrounds(backgroundColors)
  }

  fiddler
    .setHeaderFormat({
      backgrounds: 'black',
      fontColors: 'white',
      fontWeights: 'bold'
    }).setColumnFormat({
      fontWeights: 'bold',
      fontColors: 'navy'
    }, ["name", "path"])
  timers.end('formatting sheet')
  return fiddler
}

// write values to sheet
const writeSheet = (fiddler, form) => {
  timers.start('writing values')

  const data = Object.keys(form).reduce((p, c, index) => {
    Object.keys(form[c]).forEach(k => {
      p.push({ index, ...form[c][k] })
    })
    return p
  }, [])

  fiddler
    .getSheet()
    .clear()

  fiddler
    .setData(data.sort((a, b) => {
      if (a.index === b.index) {
        return new Date(b.modifiedTime).getTime() - new Date(a.modifiedTime).getTime()
      }
      return a.index - b.index
    }))

  timers.end('writing values')

  return fiddler

}
const main = () => {
  timers.start('main')
  // find dups by md5
  const max = Infinity

  // start by building a map of all folders owned by me
  // doing it like this turns out to be more efficient that recursing once files are found
  console.log('...working on files', 'max', max)
  const folderMap = getAllFolders()

  // get all the files, or start at a specific folder
  const { fileMap, count, skipped } = getAllFiles({ max })

  // get the dups
  const dups = Array.from(fileMap.values()).filter((v) => v.length > 1);
  console.log('...files examined', count, '...skipped', skipped, '...with duplicates', dups.length, '...unique files', fileMap.size)

  // attach the file paths to each file - we already calculated all the folder paths so this is quick
  for (const md5 of Object.keys(dups)) {
    for (const file of dups[md5]) {
      const parent = folderMap.get(file.parentId)
      file.path = parent ? [parent.path, file.name, parent.name].join('/') : file.name
    }
  }


  // organize the dups
  const form = formatDups(dups, folderMap)

  // write data to sheets
  const { all } = getFiddlers()
  const fiddler = all
  writeSheet(fiddler, form).dumpValues()

  /// format coloring by groups
  formatSheet(fiddler).dumpFormats()

  console.log('...results in', fiddler.getSheet().getParent().getUrl())
  timers.end('main')
}
// on node we need to launch it
if (ScriptApp.isFake) main()