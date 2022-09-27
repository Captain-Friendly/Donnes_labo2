///////////////////////////////////////////////////////////////////////////
// This class provide CRUD operations on JSON objects collection text file
// with the assumption that each object have an Id member.
// If the objectsFile does not exist it will be created on demand.
/////////////////////////////////////////////////////////////////////
// Author : Nicolas Chourot
// Lionel-Groulx College
/////////////////////////////////////////////////////////////////////

const fs = require('fs');
const utilities = require('../utilities.js');

class Repository {
   
    constructor(model) {
        this.objectsList = null;
        this.model = model;
        this.objectsName = model.getClassName() + 's';
        this.objectsFile = `./data/${this.objectsName}.json`;
        this.bindExtraDataMethod = null;
        this.updateResult = {
            ok: 0,
            conflict: 1,
            notFound: 2,
            invalid: 3
        }
    }
    setBindExtraDataMethod(bindExtraDataMethod) {
        this.bindExtraDataMethod = bindExtraDataMethod;
    }
    objects() {
        if (this.objectsList == null)
            this.read();
        return this.objectsList;
    }
    read() {
        try {
            let rawdata = fs.readFileSync(this.objectsFile);
            // we assume here that the json data is formatted correctly
            this.objectsList = JSON.parse(rawdata);
        } catch (error) {
            if (error.code === 'ENOENT') {
                // file does not exist, it will be created on demand
                log(FgYellow, `Warning ${this.objectsName} repository does not exist. It will be created on demand`);
                this.objectsList = [];
            } else {
                log(Bright, FgRed, `Error while reading ${this.objectsName} repository`);
                log(Bright, FgRed, '--------------------------------------------------');
                log(Bright, FgRed, error);
            }
        }
    }
    write() {
        fs.writeFileSync(this.objectsFile, JSON.stringify(this.objectsList));
    }
    nextId() {
        let maxId = 0;
        for (let object of this.objects()) {
            if (object.Id > maxId) {
                maxId = object.Id;
            }
        }
        return maxId + 1;
    }
    add(object) {
        try {
            if (this.model.valid(object)) {
                let conflict = false;
                if (this.model.key) {
                    conflict = this.findByField(this.model.key, object[this.model.key]) != null;
                }
                if (!conflict) {
                    object.Id = this.nextId();
                    this.objectsList.push(object);
                    this.write();
                } else {
                    object.conflict = true;
                }
                return object;
            }
            return null;
        } catch (error) {
            console.log(FgRed, `Error adding new item in ${this.objectsName} repository`);
            console.log(FgRed, '-------------------------------------------------------');
            console.log(Bright, FgRed, error);
            return null;
        }
    }
    update(objectToModify) {
        if (this.model.valid(objectToModify)) {
            let conflict = false;
            if (this.model.key) {
                conflict = this.findByField(this.model.key, objectToModify[this.model.key], objectToModify.Id) != null;
            }
            if (!conflict) {
                let index = 0;
                for (let object of this.objects()) {
                    if (object.Id === objectToModify.Id) {
                        this.objectsList[index] = objectToModify;
                        this.write();
                        return this.updateResult.ok;
                    }
                    index++;
                }
                return this.updateResult.notFound;
            } else {
                return this.updateResult.conflict;
            }
        }
        return this.updateResult.invalid;
    }
    remove(id) {
        let index = 0;
        for (let object of this.objects()) {
            if (object.Id === id) {
                this.objectsList.splice(index, 1);
                this.write();
                return true;
            }
            index++;
        }
        return false;
    }
    getAll(params = null) {
        let objectsList = this.objects();
        if (this.bindExtraDataMethod != null) {
            objectsList = this.bindExtraData(objectsList);
        }
        if (params) {
            let model = this.model; // ici bookmarks model
            let filteredAndSortedObjects = []; // filter first, sort second
            // TODO Laboratoire 2
            let sortKeys = []; // what type of
            let searchKeys = [];

            Object.keys(params).forEach(function (paramName) {
                if (paramName == "sort") {
                    let keyValues = params[paramName];
                    if (Array.isArray(keyValues)) {
                        for (let key of keyValues) {
                            let values = key.split(',');
                            let descendant = (values.length > 1) && (values[1] == "desc");
                            sortKeys.push({ key: values[0], asc: !descendant });
                        }
                    } else {
                        let value = keyValues.split(',');
                        let descendant = (value.length > 1) && (value[1] == "desc");
                        sortKeys.push({ key: value, asc: !descendant });
                    }
                } else {
                    // todo add search key
                    // Radio-Canada
                    if (paramName in model)
                        searchKeys.push({ key: paramName, value: params[paramName] });
                }
            });

            //filter
            if (searchKeys.length != 0)
                filteredAndSortedObjects = objectsList.filter((ob) => { return this.filter(ob, searchKeys) })
            else
                filteredAndSortedObjects.push(...objectsList)

            // sort
            //verifie que les sortkeys sont dans l'objet
            this.sortFields = [];

            // pour que sa marche avec compare
            for (const sortKey of sortKeys) {
                    if (Array.isArray(sortKey.key))
                        this.sortFields.push({ name: sortKey.key[1], ascending: sortKey.asc });
                    else
                        this.sortFields.push({ name: sortKey.key, ascending: sortKey.asc });

            }
            this.sortFields;
            
            if(this.sortFields.length > 0){
                const sortingFunc = this.compare.bind(this);
                filteredAndSortedObjects = filteredAndSortedObjects.sort(sortingFunc);
            }
            
            return filteredAndSortedObjects;
        }
        return objectsList;
    }
    get(id) {
        for (let object of this.objects()) {
            if (object.Id === id) {
                if (this.bindExtraDataMethod != null)
                    return this.bindExtraDataMethod(object);
                else
                    return object;
            }
        }
        return null;
    }
    removeByIndex(indexToDelete) {
        if (indexToDelete.length > 0) {
            utilities.deleteByIndex(this.objects(), indexToDelete);
            this.write();
        }
    }
    findByField(fieldName, value, excludedId = 0) {
        if (fieldName) {
            let index = 0;
            for (let object of this.objects()) {
                try {
                    if (object[fieldName] === value) {
                        if (object.Id != excludedId)
                            return this.objectsList[index];
                    }
                    index++;
                } catch (error) {
                    break;
                }
            }
        }
        return null;
    }

    filter(object, searchKeys) {

        for (let i = 0; i < searchKeys.length; i++) {
            let keys = Object.values(searchKeys[i]);
            let valueInUrl = keys[1].replaceAll('\*', '').toLowerCase();
            let valueInObject = object[keys[0]].toLowerCase();
            if (valueInObject != valueInUrl) {
                if (!(keys[1].startsWith('*') && keys[1].endsWith('*'))) {
                    if (!keys[1].startsWith('*')) {
                        if (!keys[1].endsWith('*')) {
                            return false
                        }
                        if (!valueInObject.toLowerCase().startsWith(valueInUrl))
                            return false
                    } 
                    if (!valueInObject.endsWith(valueInUrl))
                        return false;
                } 
                if (!valueInObject.includes(valueInUrl))
                    return false;
            }
        }
        return true;
    }

    compareNum(x, y) {
        if (x === y) return 0;
        else if (x < y) return -1;
        return 1;
    }
    innerCompare(x, y) {
        if ((typeof x) === 'string')
            return x.localeCompare(y);
        else
            return this.compareNum(x, y);
    }

    compare(itemX, itemY) {
        let fieldIndex = 0;
        let max = this.sortFields.length;
        do {
            let result = 0;
            if (this.sortFields[fieldIndex].ascending)
                result = this.innerCompare(itemX[this.sortFields[fieldIndex].name], itemY[this.sortFields[fieldIndex].name]);
            else
                result = this.innerCompare(itemY[this.sortFields[fieldIndex].name], itemX[this.sortFields[fieldIndex].name]);
            if (result == 0)
                fieldIndex++;
            else
                return result;
        } while (fieldIndex < max);
        return 0;
    }
}


module.exports = Repository;
