import * as application from "tns-core-modules/application"
import { DbResult, RESULT_TYPE } from "./dbresult";
import { Cursor } from "./cursor";

export class Sqlite {
    private static self: Sqlite;
    public readonly _dbname: string;
    private _db: any;
    private _isOpen: boolean;
    private _isSqlite: boolean = true;
    private _options: any;
    private _resultType: RESULT_TYPE;
    private _valuesType: RESULT_TYPE;

    constructor(dbname: string, options?: {}) {
        if (Sqlite.self instanceof Sqlite) {
            return Sqlite.self;
        }

        this._dbname = dbname;
        this._isOpen = false;
        this._resultType = RESULT_TYPE.RESULTSASARRAY;
        this._valuesType = RESULT_TYPE.VALUESARENATIVE;
        this._options = options || {};

        // Check to see if it has a path, or if it is a relative dbname
        // dbname = "" - Temporary Database
        // dbname = ":memory:" = memory database
        if (dbname !== "" && dbname !== ":memory:") {
            dbname = Sqlite._getContext().getDatabasePath(dbname).getAbsolutePath();
            var path = dbname.substr(0, dbname.lastIndexOf('/') + 1);

            // Create "databases" folder if it is missing.  This causes issues on Emulators if it is missing
            // So we create it if it is missing

            try {
                var java = java || {};
                var javaFile = new java.io.File(path);
                if (!javaFile.exists()) {
                    javaFile.mkdirs();
                    javaFile.setReadable(true);
                    javaFile.setWritable(true);
                }
            }
            catch (err) {
                return this._error(`Constructor Error: Unable to create folder\r\n${err}`);
            }
        }
        Sqlite.self = this;
        return this;
    }

    _error(message: string): null {
        console.error(`Sqlite Error:\r\n${message}`);
        return null;
    }

    openDatabase(): Promise<any> {
        return new Promise((resolve, reject) => {
            try {
                var flags = 0;
                if (typeof this._options.androidFlags !== 'undefined') {
                    flags = this._options.androidFlags;
                }
                this._db = this._openDatabase(this._dbname, flags);
            } catch (error) {
                this._error(`Unable to open database\r\n${error}`);
                return reject(error);
            }

            this._isOpen = true;
            return resolve(this);
        });
    }

    private _openDatabase(dbname: string, flags: any) {
        var android = android || {};
        if (dbname === ":memory:") {
            return android.database.sqlite.SQLiteDatabase.create(flags);
        } else {
            return android.database.sqlite.SQLiteDatabase.openDatabase(dbname, null, flags | 0x10000000);
        }
    };

    private _getResultEngine(mode: RESULT_TYPE): Function {
        if (mode == null || mode === 0) return DbResult.getResults;

        var resultType = (mode & RESULT_TYPE.RESULTSASARRAY | RESULT_TYPE.RESULTSASOBJECT);
        if (resultType === 0) {
            resultType = this._resultType;
        }
        var valueType = (mode & RESULT_TYPE.VALUESARENATIVE | RESULT_TYPE.VALUESARESTRINGS);
        if (valueType === 0) {
            valueType = this._valuesType;
        }

        if (resultType === RESULT_TYPE.RESULTSASOBJECT) {
            if (valueType === RESULT_TYPE.VALUESARESTRINGS) {
                return DbResult.asRowObjectString;
            } else {
                return DbResult.asRowObjectNative;
            }
        } else {
            if (valueType === RESULT_TYPE.VALUESARESTRINGS) {
                return DbResult.asRowArrayString;
            } else {
                return DbResult.asRowArrayNative;
            }
        }

    };

    version(valueOrCallback: number | Function): void {
        if (typeof valueOrCallback === 'function') {
            this.get('PRAGMA user_version', null, function (data, error) {
                valueOrCallback(data && parseInt(data[0], 10), error);
            }, RESULT_TYPE.RESULTSASARRAY);
        } else if (!isNaN(valueOrCallback + 0)) {
            this.execSQL('PRAGMA user_version = ' + (valueOrCallback + 0).toString());
        } else {
            this.get('PRAGMA user_version', undefined, undefined, RESULT_TYPE.RESULTSASARRAY);
        }
    };

    isOpen() {
        return this._isOpen;
    };

    private _toStringArray(params) {
        var stringParams = [];
        if (Object.prototype.toString.apply(params) === '[object Array]') {
            var count = params.length;
            for (var i = 0; i < count; ++i) {
                if (params[i] == null) {
                    stringParams.push(null);
                } else {
                    stringParams.push(params[i].toString());
                }
            }
        } else {
            if (params == null) {
                stringParams.push(null);
            } else {
                stringParams.push(params.toString());
            }
        }
        return stringParams;
    };

    resultType(type: RESULT_TYPE): RESULT_TYPE {
        if (type === RESULT_TYPE.RESULTSASARRAY) {
            this._resultType = RESULT_TYPE.RESULTSASARRAY;
            DbResult.setResultValueTypeEngine(this._resultType, this._valuesType);

        } else if (type === RESULT_TYPE.RESULTSASOBJECT) {
            this._resultType = RESULT_TYPE.RESULTSASOBJECT;
            DbResult.setResultValueTypeEngine(this._resultType, this._valuesType);
        }
        return this._resultType;
    };

    valueType(type: RESULT_TYPE): RESULT_TYPE {
        if (type === RESULT_TYPE.VALUESARENATIVE) {
            this._valuesType = RESULT_TYPE.VALUESARENATIVE;
            DbResult.setResultValueTypeEngine(this._resultType, this._valuesType);

        } else if (type === RESULT_TYPE.VALUESARESTRINGS) {
            this._valuesType = RESULT_TYPE.VALUESARESTRINGS;
            DbResult.setResultValueTypeEngine(this._resultType, this._valuesType);
        }
        return this._resultType;
    };

    close(): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this._isOpen) {
                let error = "Database is already closed";
                this._error(error);
                return reject(error);
            }
            else {
                this._db.close();
                this._isOpen = false;
                return resolve();
            }
        });
    };

    get(sql: string, params?: {}, callback?: Function, mode?: RESULT_TYPE): Promise<any> {
        var hasCallback = true;
        if (typeof callback !== 'function') {
            hasCallback = false;
        }

        return new Promise((resolve, reject) => {
            if (!this._isOpen) {
                var message = "Database is not open";
                this._error(message);
                if (hasCallback) callback(null, message);
                return reject(message);
            }

            var cursor: Cursor;
            try {
                if (params !== undefined) {
                    cursor = this._db.rawQuery(sql, this._toStringArray(params));
                } else {
                    cursor = this._db.rawQuery(sql, null);
                }
            } catch (error) {
                this._error(error);
                callback(null, error);
                return reject(error);
            }

            // No Records
            if (cursor.getCount() === 0) {
                cursor.close();
                if (hasCallback) {
                    callback(null, null);
                }
                return resolve(null);
            }

            var results;
            var resultEngine = this._getResultEngine(mode);
            try {
                cursor.moveToFirst();
                results = resultEngine(cursor);
                cursor.close();
            } catch (error) {
                this._error(error);
                callback(null, error);
                return reject(error);;
            }
            if (hasCallback) {
                callback(results, null);
            }
            resolve(results);
        });
    }

    execSQL(sql: string, params?: {}): Promise<any> {
        return new Promise((resolve, reject) => {
            if (!this._isOpen) {
                var message = "Database is not open";
                this._error(message);
                return reject(message);
            }

            // Need to see if we have to run any status queries afterwords
            var flags = 0;
            var queryType = sql.trim().substr(0, 7).toLowerCase();
            if (queryType === 'insert ') {
                flags = 1;
            } else if (queryType === 'update ' || queryType === 'delete ') {
                flags = 2;
            }

            try {
                if (params !== undefined) {
                    this._db.execSQL(sql, this._toStringArray(params));
                } else {
                    this._db.execSQL(sql);
                }
            } catch (error) {
                this._error(error);
                return reject(error);
            }

            switch (flags) {
                case 0:
                    return resolve(null);
                    break;
                case 1:
                    this.get('select last_insert_rowid()', null, function (data, error) {
                        if (error) {
                            return reject(error);
                        } else {
                            return resolve(data && data[0]);
                        }
                    }, RESULT_TYPE.RESULTSASARRAY | RESULT_TYPE.VALUESARENATIVE);
                    break;
                case 2:
                    this.get('select changes()', null, function (data, error) {
                        if (error) {
                            return reject(error);
                        } else {
                            return resolve(data && data[0]);
                        }
                    }, RESULT_TYPE.RESULTSASARRAY | RESULT_TYPE.VALUESARENATIVE);
                    break;
                default:
                    return resolve();
            }

        });
    }

    all(sql: string, params?: {} | Function, callback?: Function): Promise<any> {
        if (typeof params === 'function') {
            callback = params;
            params = undefined;
        }

        return new Promise(function (resolve, reject) {
            var hasCallback = true;
            if (typeof callback !== 'function') {
                callback = reject;
                hasCallback = false;
            }

            if (!this._isOpen) {
                var message = "Database is not open";
                this._error(message);
                callback(null, message);
                return reject(message);
            }

            var cursor: Cursor, count: number;
            try {
                if (params !== undefined) {
                    cursor = this._db.rawQuery(sql, this._toStringArray(params));
                } else {
                    cursor = this._db.rawQuery(sql, null);
                }
                count = cursor.getCount();
            } catch (error) {
                this._error(error);
                callback(null, error);
                return reject(error);
            }

            // No Records
            if (count === 0) {
                cursor.close();
                if (hasCallback) {
                    callback([], null);
                }
                return resolve([]);
            }
            cursor.moveToFirst();

            var results = [];
            try {
                for (var i = 0; i < count; i++) {
                    var data = DbResult.getResults(cursor);
                    results.push(data);
                    cursor.moveToNext();
                }
                cursor.close();
            } catch (error) {
                callback(null, error);
                return reject(error);
            }
            if (hasCallback) {
                callback(results, null);
            }
            return resolve(results);
        });
    }

    each(sql: string, params?: {} | Function, callback?: Function, complete?: Function): Promise<any> {
        if (typeof params === 'function') {
            complete = callback;
            callback = params;
            params = undefined;
        }

        return new Promise(function (resolve, reject) {

            // Callback is required
            if (typeof callback !== 'function') {
                var message = "Sqlite 'Each' function requires a callback";
                this._error(message);
                return reject(message);
            }

            // Set the error Callback
            var errorCB = complete || callback;

            var cursor: Cursor, count: number;
            try {
                if (params !== undefined) {
                    cursor = this._db.rawQuery(sql, this._toStringArray(params));
                } else {
                    cursor = this._db.rawQuery(sql, null);
                }
                count = cursor.getCount();
            } catch (error) {
                errorCB(null, error);
                return reject(error);
            }

            // No Records
            if (count === 0) {
                cursor.close();
                if (complete) {
                    complete(0, null);
                }
                return resolve(0);
            }
            cursor.moveToFirst();

            try {
                for (var i = 0; i < count; i++) {
                    var data = DbResult.getResults(cursor);
                    callback(data, null);
                    cursor.moveToNext();
                }
                cursor.close();
            } catch (error) {
                errorCB(null, error);
                return reject(error);
            }
            if (complete) {
                complete(count, null);
            }
            return resolve(count);
        });
    }

    isSqlite(obj) {
        return obj && obj._isSqlite;
    }

    static _getContext() {
        if (application.android.context) {
            return (application.android.context);
        }
        var java = java || {};
        var ctx = java.lang.Class.forName("android.app.AppGlobals").getMethod("getInitialApplication", null).invoke(null, null);
        if (ctx) return ctx;

        ctx = java.lang.Class.forName("android.app.ActivityThread").getMethod("currentApplication", null).invoke(null, null);
        return ctx;
    }

    static exists(dbname: string): boolean {
        var java = java || {};
        var dbName = Sqlite._getContext().getDatabasePath(dbname).getAbsolutePath();
        var dbFile = new java.io.File(dbName);
        return <boolean>dbFile.exists();
    }

    static deleteDatabase(dbname: string) {
        var java = java || {};
        var dbName = Sqlite._getContext().getDatabasePath(dbname).getAbsolutePath();
        var dbFile = new java.io.File(dbName);
        if (dbFile.exists()) {
            dbFile.delete();
            dbFile = new java.io.File(dbName + '-journal');
            if (dbFile.exists()) {
                dbFile.delete();
            }
        }
    }

    static copyDatabase(dbname: string) {
        var java = java || {};

        //Open your local db as the input stream
        var myInput = Sqlite._getContext().getAssets().open("app/" + dbname);

        if (dbname.indexOf('/')) {
            dbname = dbname.substring(dbname.indexOf('/') + 1);
        }

        var dbName = Sqlite._getContext().getDatabasePath(dbname).getAbsolutePath();
        var path = dbName.substr(0, dbName.lastIndexOf('/') + 1);

        // Create "databases" folder if it is missing.  This causes issues on Emulators if it is missing
        // So we create it if it is missing

        try {
            var javaFile = new java.io.File(path);
            if (!javaFile.exists()) {
                javaFile.mkdirs();
                javaFile.setReadable(true);
                javaFile.setWritable(true);
            }
        }
        catch (error) {
            console.error(`Sqlite Error: @copyDatabase\r\nCreating DB Folder Error\r\n${error}`);
            return false;
        }

        //Open the empty db as the output stream
        var myOutput = new java.io.FileOutputStream(dbname);

        var success = true;
        try {
            //transfer bytes from the inputfile to the outputfile
            var buffer = java.lang.reflect.Array.newInstance(java.lang.Byte.class.getField("TYPE").get(null), 1024);
            var length;
            while ((length = myInput.read(buffer)) > 0) {
                myOutput.write(buffer, 0, length);
            }
        }
        catch (err) {
            success = false;
        }

        //Close the streams
        myOutput.flush();
        myOutput.close();
        myInput.close();
        return success;
    }
}
