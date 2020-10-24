var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};

const utils  = require("./utils");
const vscode = require("vscode");

let opeParam = {
    "os"            : "",
    "rootPath"      : `${__dirname}`.replace(/\\/g,"\/"),
    "workspacePath" : ""
}
exports.opeParam = opeParam;

/* 前端开发辅助功能 */

/* 语言服务功能 */

// 定义跳转
class DefinitionProvider {
    constructor(workspaceSymProvider) {
        // Strings used in regex'es
        // private regex_module = '$\\s*word\\s*(';
        this.regex_port = '\\.word\\s*\\(';
        this.regex_package = '\\b(\\w+)\\s*::\\s*(word)';
        this.workspaceSymProvider = workspaceSymProvider;
    };
    provideDefinition(document, position, token) {
        return new Promise((resolve, reject) => __awaiter(this, void 0, void 0, function* () {
            let range = document.getWordRangeAtPosition(position);
            let line = document.lineAt(position.line).text;
            let word = document.getText(range);
            // Check for port
            let match_port = line.match(this.regex_port.replace('word', word));
            let match_package = line.match(this.regex_package.replace('word', word));
            if (!range) {
                reject();
            }
            // Port
            else if (match_port && match_port.index === range.start.character - 1) {
                let container = this.moduleFromPort(document, range);
                resolve(Promise.resolve(this.workspaceSymProvider.provideWorkspaceSymbols(container, token, true).then(res => {
                    return Promise.all(res.map(x => this.findPortLocation(x, word)));
                }).then(arrWithUndefined => {
                    return this.clean(arrWithUndefined, undefined);
                })));
                reject();
            }
            // Parameter
            else if (match_package && line.indexOf(word, match_package.index) == range.start.character) {
                yield this.workspaceSymProvider.provideWorkspaceSymbols(match_package[1], token, true)
                    .then((ws_symbols) => {
                    if (ws_symbols.length && ws_symbols[0].location) {
                        return ws_symbols[0].location.uri;
                    }
                }).then(uri => {
                    if (uri) {
                        vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", uri, word).then((symbols) => {
                            let results = [];
                            this.getDocumentSymbols(results, symbols, word, uri, match_package[1]);
                            resolve(results);
                        });
                    }
                });
                reject();
            }
            else {
                // Lookup all symbols in the current document
                yield vscode.commands.executeCommand("vscode.executeDocumentSymbolProvider", document.uri, word)
                    .then((symbols) => {
                    let results = [];
                    this.getDocumentSymbols(results, symbols, word, document.uri);
                    if (results.length !== 0) {
                        resolve(results);
                    }
                });
                yield this.workspaceSymProvider.provideWorkspaceSymbols(word, token, true)
                    .then(res => {
                    if (res.length !== 0) {
                        resolve(res.map(x => x.location));
                    }
                });
                reject();
            }
        }));
    }
    findPortLocation(symbol, port) {
        return vscode.workspace.openTextDocument(symbol.location.uri).then(doc => {
            for (let i = symbol.location.range.start.line; i < doc.lineCount; i++) {
                let line = doc.lineAt(i).text;
                if (line.match("\\bword\\b".replace('word', port))) {
                    return new vscode.Location(symbol.location.uri, new vscode.Position(i, line.indexOf(port)));
                }
            }
        });
    }
    moduleFromPort(document, range) {
        let text = document.getText(new vscode.Range(new vscode.Position(0, 0), range.end));
        let depthParathesis = 0;
        let i = 0;
        for (i = text.length; i > 0; i--) {
            if (text[i] == ')')
                depthParathesis++;
            else if (text[i] == '(')
                depthParathesis--;
            if (depthParathesis == -1) {
                let match_param = text.slice(0, i).match(/(\w+)\s*#\s*$/);
                let match_simple = text.slice(0, i).match(/(\w+)\s+(\w+)\s*$/);
                if (match_param)
                    return match_param[1];
                else if (match_simple)
                    return match_simple[1];
            }
        }
    }
    getDocumentSymbols(results, entries, word, uri, containerName) {
        for (let entry of entries) {
            if (entry.name === word) {
                if (containerName) {
                    if (entry.containerName === containerName) {
                        results.push({
                            uri: uri,
                            range: entry.range,
                        });
                    }
                }
                else {
                    results.push({
                        uri: uri,
                        range: entry.range,
                    });
                }
            }
            if (entry.children) {
                this.getDocumentSymbols(results, entry.children, word, uri);
            }
        }
    }
    clean(arr, deleteValue) {
        for (var i = 0; i < arr.length; i++) {
            if (arr[i] == deleteValue) {
                arr.splice(i, 1);
                i--;
            }
        }
        return arr;
    }
}
exports.DefinitionProvider = DefinitionProvider;

// 悬停提示
class HoverProvider {
    provideHover(document, position, token) {
        return new Promise((resolve, reject) => {
            var lookupRange = document.getWordRangeAtPosition(position);
            if (!lookupRange) {
                return resolve(undefined);
            }
            let defination = vscode.commands.executeCommand("vscode.executeDefinitionProvider", document.uri, position, token);
            resolve(defination.then((loc) => {
                return vscode.workspace.openTextDocument(loc[0].uri).then(doc => {
					let content = doc.lineAt(loc[0].range.start.line).text;
					if(String.prototype.trim) {
						content = content.trim();
					} else {
						content = content.replace(/^\s+(.*?)\s+$/g, "$1");
                    }
                    let hoverContent = '';
                    let i = 0;
                    for (let index = 0; index < content.length; index++) {
                        const element = content[index];
                        if (element == ' ') {
                            i++;
                        }
                        if ((element != ' ') || (i <= 4)) {
                            hoverContent = hoverContent + element;
                            if (i > 4) {
                                i = 0;
                            }
                        }
                    }
					return hoverContent.replace(/\/\//g, "\n//");
                });
            }).then((str) => {
                return new vscode.Hover( { language: 'systemverilog', value: str } );
            }));
        });
    }
}
exports.HoverProvider = HoverProvider;

// 文件标志
class DocumentSymbolProvider {
    constructor(parser) {
        this.depth = -1;
        this.parser = parser;
        const settings = vscode.workspace.getConfiguration();
        this.precision = settings.get("HDL.documentSymbolsPrecision");
        if (this.precision != "full") {
            this.depth = 1;
        }
    }
    /**
        Matches the regex pattern with the document's text. If a match is found, it creates a `Symbol` object.
        If `documentSymbols` is not `undefined`, than the object is added to it,
        otherwise add the objects to an empty list and return it.
        
        @param document The document in which the command was invoked.
        @param token A cancellation token.
        @return A list of `Symbol` objects or a thenable that resolves to such. The lack of a result can be
        signaled by returning `undefined`, `null`, or an empty list.
    */
    provideDocumentSymbols(document, token) {
        console.debug("provideDocumentSymbols!", document.uri.path);
        return new Promise((resolve) => {
            /*
            Matches the regex and uses the index from the regex to find the position
            TODO: Look through the symbols to check if it either is defined in the current file or in the workspace.
                  Use that information to figure out if an instanciated 'unknown' object is of a known type.
            */
            resolve(this.parser.get_all_recursive(document, this.precision, this.depth));
            // resolve(show_SymbolKinds(document.uri));
        });
    }
}
exports.DocumentSymbolProvider = DocumentSymbolProvider;

// 工作区标志
class WorkspaceSymbolProvider {
    constructor(indexer) {
        this.NUM_FILES = 250;
        this.indexer = indexer;
        this.HDLSymbol = new utils.HDLSymbol();
    };
    /**
        Queries a symbol from `this.symbols`, performs an exact match if `exactMatch` is set to true,
        and a partial match if it's not passed or set to false.

        @param query the symbol's name
        @param token the CancellationToken
        @param exactMatch whether to perform an exact or a partial match
        @return an array of matching Symbol
    */
    provideWorkspaceSymbols(query, token, exactMatch) {
        return new Promise((resolve, reject) => {
            if (query.length === 0) {
                resolve(this.indexer.mostRecentSymbols);
            }
            else {
                const pattern = new RegExp(".*" + query.replace(" ", "").split("").map((c) => c).join(".*") + ".*", 'i');
                let results = new Array();
                this.indexer.symbols.forEach(list => {
                    list.forEach(symbol => {
                        if (exactMatch === true) {
                            if (symbol.name == query) {
                                results.push(symbol);
                            }
                        }
                        else if (symbol.name.match(pattern)) {
                            results.push(symbol);
                        }
                    });
                });
                this.indexer.updateMostRecentSymbols(results.slice(0)); //pass a shallow copy of the array
                resolve(results);
            }
        });
    }
    /**
        Queries a `module` with a given name from `this.symbols`, performs an exact match if `exactMatch` is set to true,
        and a partial match if it's not passed or set to false.
        @param query the symbol's name
        @return the module's Symbol
    */
    provideWorkspaceModule(query) {
        if (query.length === 0) {
            return undefined;
        }
        else {
            let symbolInfo = undefined;
            this.indexer.symbols.forEach(list => {
                list.forEach(symbol => {
                    if (symbol.name == query && symbol.kind == this.HDLSymbol.getSymbolKind("module")) {
                        symbolInfo = symbol;
                        return false;
                    }
                });
                if (symbolInfo) {
                    return false;
                }
            });
            this.indexer.updateMostRecentSymbols([symbolInfo]);
            return symbolInfo;
        }
    }
}
exports.WorkspaceSymbolProvider = WorkspaceSymbolProvider;

/* 自动补全功能 */
class vhdlCompletionOption {
    constructor () {
        let Keyword = ['library','use','package','entity','configuration','is','begin','map','of','for']
        let operatorOptions = ['abs','and','mod','nand','nor','not','or','rem','rol','ror','sla','sll','sra','srl','xnor','xor'];
        let archTypeOptions = ['array','type','component','constant','signal','subtype','variable','assert','severity','report','process','with','select','when','others','block','function','procedure','case','else','elsif','for','generate','if','loop','map','next','others','return','wait','then','return','when','while'];
        let portTypeOptions = ['in','out','inout','buffer','linkage'];
        let entityOptions   = ['generic','port'];
    }
    createCompletionKeyword(label, doc) {
        let item = new vscode.CompletionItem(label);
        item.kind = vscode.CompletionItemKind.Keyword;
        if (doc) {
            item.documentation = doc;
        }
        return item;
    }
    createCompletionOption(option, doc) {
        let item = new vscode.CompletionItem(option);
        item.kind = vscode.CompletionItemKind.Value;
        item.documentation = doc;
        return item;
    }
    provideCompletionItems(document, position, token) {
        return new Promise((resolve, reject) => {
            let filename = document.fileName;
            let lineText = document.lineAt(position.line).text;
            if (lineText.match(/^\s*\-\-/)) {
                return resolve([]);
            }
            let inString = false;
            if ((lineText.substring(0, position.character).match(/\"/g) || []).length % 2 === 1) {
                inString = true;
            }
            let suggestions = [];
            let textBeforeCursor = lineText.substring(0, position.character - 1);
            let scope = vhdlScopeGuesser.guessScope(document, position.line);
            //console.log(scope.syntax);
            //console.log(textBeforeCursor);
            switch (scope.kind) {
                case vhdlScopeGuesser.VhdlScopeKind.Vhdl: {
                    suggestions.push(kwArchitecture);
                    suggestions.push(kwBegin);
                    suggestions.push(kwConfiguration);
                    suggestions.push(kwEnd);
                    suggestions.push(kwEntity);
                    suggestions.push(kwIs);
                    suggestions.push(kwPackage);
                    suggestions.push(kwUse);
                    suggestions.push(kwLibrary);
                    break;
                }
                case vhdlScopeGuesser.VhdlScopeKind.Entity: {
                    if (textBeforeCursor.match(/^\s*\w*$/)) {
                        suggestions.push(...entityOptions);
                        suggestions.push(...portTypeOptions);
                        suggestions.push(kwBegin);
                        suggestions.push(kwEnd);
                    }
                    else if (textBeforeCursor.match(/(in|out|inout|buffer|linkage)\s*$/)) {
                        suggestions.push(...scalaTypes);
                    }
                    break;
                }
                case vhdlScopeGuesser.VhdlScopeKind.Architecture: {
                    if (textBeforeCursor.match(/^\s*\w*$/)) {
                        suggestions.push(...archTypeOptions);
                        suggestions.push(kwBegin);
                        suggestions.push(kwEnd);
                        suggestions.push(kwIs);
                        suggestions.push(kwOf);
                    }
                    else if (textBeforeCursor.match(/(in|out|inout|buffer|linkage)\s*$/)) {
                        suggestions.push(...scalaTypes);
                    }
                    else if (textBeforeCursor.match(/(signal|variable|constant|subtype|type|array)\s*\w*:\s*$/)) {
                        suggestions.push(...scalaTypes);
                    }
                    else if (textBeforeCursor.match(/(<=|:=)\s*\w*\s*$/)) {
                        suggestions.push(...operatorOptions);
                    }
                    break;
                }
                case vhdlScopeGuesser.VhdlScopeKind.Configuration: {
                    suggestions.push(kwFor);
                    break;
                }
            }
            return resolve(suggestions);
        });
    }
}
exports.vhdlCompletionOption = vhdlCompletionOption;

/* 仿真功能 */
function simRegister(context,root_path) {
    let workspace_path = utils.getCurrentWorkspaceFolder();
    let tool_path = `${root_path}/.TOOL`;
    
    let simulate = vscode.commands.registerCommand('FPGA.Simulate', () => {
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
        }
        utils.mkdir(`${workspace_path}prj/simulation/iVerilog`);

        let vvpPath = "vvp";
        let gtkwavePath = "gtkwave";
        let iVerilogPath = "iverilog";
        let gtkwaveInstallPath = vscode.workspace.getConfiguration().get('PRJ.gtkwave.install.path');
        let iVerilogInstallPath = vscode.workspace.getConfiguration().get('PRJ.iVerilog.install.path');
        if (iVerilogInstallPath != "") {
            vvpPath = iVerilogInstallPath + "vvp.exe";
            gtkwavePath = gtkwaveInstallPath + "gtkwave.exe";
            iVerilogPath = iVerilogInstallPath + "iverilog.exe";
        }

        let simLibRootPath = "";
        let GlblPath = "";
        let LibPath  = "";
        let propertyPath = utils.getPropertypath(workspace_path);
        if (propertyPath != '') {            
            if (utils.getFpgaVersion(propertyPath) == "xilinx") {					
                simLibRootPath = vscode.workspace.getConfiguration().get('PRJ.xilinx.install.path');
                if (simLibRootPath != "") {                
                    simLibRootPath = simLibRootPath + "/Vivado/2018.3/data/verilog/src";
                    GlblPath = simLibRootPath + "/glbl.v ";
                    LibPath  = "-y " + simLibRootPath + "/xeclib ";
                    LibPath = LibPath + "-y " + simLibRootPath + "/unisims ";
                    LibPath = LibPath + "-y " + simLibRootPath + "/unimacro ";
                    LibPath = LibPath + "-y " + simLibRootPath + "/unifast ";
                    LibPath = LibPath + "-y " + simLibRootPath + "/retarget ";
                } else {
                    vscode.window.showInformationMessage("PRJ.xilinx.install.path is empty");
                }
            }
        }

        let verilogModuleInfoList = utils.getAllModuleInfo(`${workspace_path}user`,".v");

        let content = utils.readFile(editor.document.fileName);
        let moduleNameList = utils.getModuleName(content);
        if (moduleNameList.length != 0) {
            if (moduleNameList.length >= 2) {
                vscode.window.showInformationMessage("There are multiple modules, please select one of them");
                vscode.window.showQuickPick(moduleNameList).then(selection => {
                    if (!selection) {
                        return;
                    }
                    let iverilogPath = workspace_path + "prj/simulation/iVerilog/" + selection;
                    let rtlFilePath = "";
                    let instanceModuleNameList = utils.getInstanceModuleName(
                        utils.getModuleContent(content,selection));
                    if (instanceModuleNameList != null) {                        
                        let moduleFilePathList = [];
                        instanceModuleNameList.forEach(element => {
                            let moduleFilePath = utils.searchModuleFilePath(
                                element,verilogModuleInfoList);
                            moduleFilePath.forEach(element => {
                                moduleFilePathList.push(element);
                            });
                        });
                        moduleFilePathList = common.removeDuplicates(moduleFilePathList);
                        moduleFilePathList.forEach(element => {
                            rtlFilePath = rtlFilePath + element + " ";
                        });
                    }
                    let command = `${iVerilogPath} -g2012 -o ${iverilogPath} ${editor.document.fileName} ${rtlFilePath} ${GlblPath} ${LibPath}`;
                    // terminal_ope.runCmd(command);
                    exec(command,function (error, stdout, stderr) {
                        vscode.window.showInformationMessage(stdout);
                        if (error !== null) {
                            vscode.window.showErrorMessage(stderr);
                        } else {
                            vscode.window.showInformationMessage("iVerilog simulates successfully!!!");
                            let waveImagePath = utils.getWaveImagePath(content);
                            if (waveImagePath != '') {
                                let waveImageExtname = waveImagePath.split('.');
                                let Simulate = vscode.window.createTerminal({ name: 'Simulate' });
                                Simulate.show(true);
                                Simulate.sendText(`${vvpPath} ${iverilogPath} -${waveImageExtname[waveImageExtname.length-1]}`);
                                let gtkwave = vscode.window.createTerminal({ name: 'gtkwave' });
                                gtkwave.show(true);
                                gtkwave.sendText(`${gtkwavePath} ${waveImagePath}`);
                            } else {
                                vscode.window.showWarningMessage("There is no wave image path in this testbench");
                            }
                        }
                    });
                });
            }
            else {
                let iverilogPath = workspace_path + "prj/simulation/iVerilog/" + moduleNameList[0];
                let rtlFilePath = "";
                let instanceModuleNameList = utils.getInstanceModuleName(
                    utils.getModuleContent(content,moduleNameList[0]));
                if (instanceModuleNameList != '') {                        
                    let moduleFilePathList = [];
                    instanceModuleNameList.forEach(element => {
                        let moduleFilePath = utils.searchModuleFilePath(
                            element,verilogModuleInfoList);
                        moduleFilePath.forEach(element => {
                            moduleFilePathList.push(element);
                        });
                    });
                    moduleFilePathList = common.removeDuplicates(moduleFilePathList);
                    moduleFilePathList.forEach(element => {
                        rtlFilePath = rtlFilePath + element + " ";
                    });
                }
                let command = `${iVerilogPath} -g2012 -o ${iverilogPath} ${editor.document.fileName} ${rtlFilePath} ${GlblPath} ${LibPath}`;
                // terminal_ope.runCmd(command);
                exec(command,function (error, stdout, stderr) {
                    vscode.window.showInformationMessage(stdout);
                    if (error !== null) {
                        vscode.window.showErrorMessage(stderr);
                    } else {
                        vscode.window.showInformationMessage("iVerilog simulates successfully!!!");
                        let waveImagePath = utils.getWaveImagePath(content);
                        if (waveImagePath != '') {
                            let waveImageExtname = waveImagePath.split('.');
                            let Simulate = vscode.window.createTerminal({ name: 'Simulate' });
                            Simulate.show(true);
                            Simulate.sendText(`${vvpPath} ${iverilogPath} -${waveImageExtname[waveImageExtname.length-1]}`);
                            let gtkwave = vscode.window.createTerminal({ name: 'gtkwave' });
                            gtkwave.show(true);
                            gtkwave.sendText(`${gtkwavePath} ${waveImagePath}`);

                        } else {
                            vscode.window.showWarningMessage("There is no wave image path in this testbench");
                        }
                    }
                });
            }         
        }
        else {
            vscode.window.showWarningMessage("There is no module in this file")
        }
    });
	context.subscriptions.push(simulate);
	let vInstance_Gen = vscode.commands.registerCommand('FPGA.instance', () => {
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
		}
		// if (terminal_ope.ensureTerminalExists("Instance")) {
		// 	Instance.sendText(`python ${tool_path}/.Script/vInstance_Gen.py ${editor.document.fileName}`);
		// 	vscode.window.showInformationMessage('Generate instance successfully!');
		// }
		// else {
		// 	Instance = vscode.window.createTerminal({ name: 'Instance' });
		// 	Instance.show(true);
		// 	Instance.sendText(`python ${tool_path}/.Script/vInstance_Gen.py ${editor.document.fileName}`);
		// 	vscode.window.showInformationMessage('Generate instance successfully!');
        // }

        let moduleName;
        let moduleNameList  = [];
        let verilogFileList = [];
        verilogFileList = utils.pick_Allfile(`${workspace_path}user`,".v");
        verilogFileList.forEach(element => {
            let content;
            let verilogFilePath = element;
            content = utils.readFile(verilogFilePath);
            moduleName = utils.getModuleName(content);
            if (moduleName.length != 0) {
                moduleName.forEach(element => {                    
                    element = element + "    ." + verilogFilePath;
                    element = element.replace(`${workspace_path}`,"");
                    moduleNameList.push(element);
                });
            }
        });
        vscode.window.showQuickPick(moduleNameList).then(selection => {
            if (!selection) {
                return;
            }
            let modulePathList = selection.split("    .");
            let modulePath = `${workspace_path}` + modulePathList[1];
            let content = utils.readFile(modulePath);
            content = utils.delComment(content);
            utils.instanceVerilogModule(content,modulePathList[0])
            //  editor.edit((editBuilder) => {
            //      editBuilder.replace(editor.selection, v);
            //  });
        });
    });
    context.subscriptions.push(vInstance_Gen);
    let testbench = vscode.commands.registerCommand('FPGA.testbench', () => {
        let editor = vscode.window.activeTextEditor;
        if (!editor) {
            return;
		}
		let command = `python ${tool_path}/.Script/vTbgenerator.py ${workspace_path} ${editor.document.fileName}`;
		terminal_ope.runCmd(command);
		vscode.window.showInformationMessage(command);
    });
	context.subscriptions.push(testbench);
}
exports.simRegister = simRegister;

/* 后端开发辅助功能 */

/* 调试开发辅助功能 */
