const fs = require('fs');
const fsp = require('fs/promises');
let sshclient = require('ssh2').Client;
let TFTPServer = require('./tftp.js').TFTPServer;


class IMM {
    #sshconnection;
    _sshusername;
    _sshpassword;

    constructor ({immhostname, sshUser, sshPassword}){
        if (!immhostname || typeof(immhostname) != 'string') {
            throw new Error(`Hostname not correct: hostname - "${immhostname}"`);
        }
        if (!sshUser || !sshPassword) {
            throw new Error(`Invalid credentials for SSH-connection: username - "${sshUser}", password - "${sshPassword}"`);
        }
        this._sshusername = sshUser;
        this._sshpassword = sshPassword;
        this._hostname = immhostname;
    }

    getHostname () {
        return this._hostname;
    }

    //////////////////SSH client////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////
    async sshConnect () {
        this.#sshconnection = new sshclient();
        let ready = new Promise((resolve, reject) => {
            this.#sshconnection.once('ready', () => resolve());
            this.#sshconnection.once('error', (error) => reject(error))
        });
        this.#sshconnection.connect({host: this.getHostname(), port: 22, username: this._sshusername, password: this._sshpassword});
        return ready;
    }

    async sshConnectIfNotConnected () {
        if (!this.isSshConnected()) {
            return this.sshConnect();
        }
        return true;
    }

    async sshDisconnect () {
        if (this.#sshconnection) {
            let p_end = new Promise((resolve, reject) => {
                this.#sshconnection.once('end', () => {
                    this.#sshconnection = undefined;
                    resolve();
                });
            });
            this.#sshconnection.end();
            return p_end;
        }
        else //already disconnected
        {
            return true;
        }
        
    }

    async sshExecCommand (command) {
        await this.sshConnectIfNotConnected();// ???? ???????????? ???????? ???? ?????????????? ???????????? ?????????? disconect, ?????? ?????? ?????????????????????? ???? ?????????????? ???????????????? ??????????????
        let sshdata = {stdout: '', stderr: ''};
        return new Promise ((resolve, reject) => {
            this.#sshconnection.exec(command, (err, stream) => {
                if (err){
                    throw new Error(`Error occurred while executing command "${command}": ${err}`);
                } else {
                    stream.on('data', data => {sshdata.stdout += data});
                    stream.stderr.on('data', data => {sshdata.stderr += data});
                    stream.once('close', (code, signal) => resolve(sshdata));
                }
            })
        });
    }

    _checkSSHout_ok (command, sshout) {
        if(sshout.stdout.search(/^system> ok$/m) == -1 || sshout.stderr.length > 0) {
            throw new Error(`Command "${command}" on "${this.getHostname()}" executed with non-ok output: stdout - "${sshout.stdout}", stderr - "${sshout.stderr}"`);
        }
    }

    _checkSSHout_dotok (command, sshout) {
        if(sshout.stdout.search(/^system> \.+ok$/m) == -1 || sshout.stderr.length > 0) {
            throw new Error(`Command "${command}" on "${this.getHostname()}" executed with non-ok output: stdout - "${sshout.stdout}", stderr - "${sshout.stderr}"`);
        }
    }

    isSshConnected () {
        if (this.#sshconnection) {
            return true;
        } else {
            return false;
        }
    }
    _sshGetUsername () {
        return this._sshusername;
    }
    _sshGetPassword () {
        return this._sshpassword;
    }
    //////////////////////////////////////////////////////////////////////////////
    async immRestart () {
        await this.sshConnectIfNotConnected();
        let command_reset = "spreset";
        let sshout = await this.sshExecCommand(command_reset);
        if(sshout.stdout.search(/^system> Submitting reset request.. Reset done.$/m) == -1 || sshout.stderr.length > 0) {
            throw new Error(`The error occurred when IMM/XCC was restarted on "${this.getHostname()}": stdout - "${sshout.stdout}", stderr - "${sshout.stderr}"`);
        }
        await this.sshDisconnect();//???????? ???????? ???????????? ????????????, ???????????? ??????????????????, sshExecCommand ?????????????????????? ?????? ?????? ???? ?????????????? ?? ?????????????? ??????????????
        //?????????? ?????????????????? ?????? ????????????????????
    }

    async getIMMtype () {
        await this.sshConnectIfNotConnected();
        let command_check = "vpd bmc";
        let sshout = await this.sshExecCommand(command_check);
        if(sshout.stdout.search(/^system> Unknown option: bmc$/m) != -1 && sshout.stderr.length == 0) {
            return 'IMM2';
        }
        else if(sshout.stdout.search(/^system> Type.+/m) != -1 && sshout.stderr.length == 0){
            return 'XCC';
        }
        else if (sshout.stderr.length > 0) {
            throw new Error(`The error occurred when IMM/XCC was detected type on "${this.getHostname()}": stdout - "${sshout.stdout}", stderr - "${sshout.stderr}"`);
        }
        await this.sshDisconnect();
    }
};


class webssl extends IMM {
    _csrFilePath;
    _certFilePath;
    _TFTP;

    constructor ({immhostname, sshUser, sshPassword}) {
        super({immhostname, sshUser, sshPassword});
        this._TFTP=new TFTPServer();
    }

    //////////////////other///////////////////////////////////////////////////////
    //////////////////////////////////////////////////////////////////////////////
    async #checkFile (filename) {
        return new Promise ((resolve, reject) => {
            fs.access(filename, fs.constants.F_OK, error => {
                if (error)
                {
                    reject(`"${filename}" doesn't exist!`);
                }
                else
                {
                    resolve(filename);
                }
                })
        });
    }

    async #findCERfile (path) {
        const dir = await fsp.opendir(path);
        let r_findimm = new RegExp(`^${this.getHostname()}.*?\.cer$`, "i");
        for await (const dirent of dir){
            if (dirent.name.match(r_findimm)){
                return dirent.name;
            }
        }
        throw new Error(`.cer file for ${this.getHostname()} not found in ${path}`);
    }
    ////////////////////////////////////////////////////////////////////////////

    async generateCSR ({csrCountry="RU" ,csrState="Far East", csrCity="Khabarovsk", csrOrg="JSC SO UES Branch of ODU East", 
        csrHostName=this.getHostname(), csrCPerson, csrCEmail, csrOrgUnit, csrDomainQ}) {

        let command = `sslcfg -csr server -c "${csrCountry}" -sp "${csrState}" -cl "${csrCity}" -on "${csrOrg}" -hn "${csrHostName}" -cp "${csrCPerson}" -ea "${csrCEmail}" -ou "${csrOrgUnit}" -dq "${csrDomainQ}"`;
        try 
        {
            await this.sshConnectIfNotConnected();
            let sshout = await this.sshExecCommand(command);
            this._checkSSHout_ok(command, sshout);
        } 
        catch (error) {
            throw error
        } finally {
            await this.sshDisconnect();
        }
        return command;
    }

    async uploadCSR ({TFTPlistenip, TFTPlistenport=69, TFTPdir, uploadFileName=`${this.getHostname()}.csr`}) {
        let command = `sslcfg -csr server -dnld -i ${TFTPlistenip} -l "${uploadFileName}"`;
        try 
        {
            await this._TFTP.startTFTPServer({listenip: TFTPlistenip, port: TFTPlistenport, dir: TFTPdir});
            let p_fileuplod = this._TFTP._waitTFTPuploadFile();
            await this.sshConnectIfNotConnected();
            let sshout = await this.sshExecCommand(command);
            this._checkSSHout_ok(command, sshout);
            let TFTPuploadfilename = await p_fileuplod;
            if (!TFTPuploadfilename || TFTPuploadfilename != uploadFileName) {
                throw new Error(`File "${TFTPuploadfilename}" had been uploaded to TFTP server, but expected file "${uploadFileName}"`);
            } 
            this._csrFilePath = await this.#checkFile(`${TFTPdir}\\${uploadFileName}`); 
        } catch (error) {
            throw error
        } finally {
            await this.sshDisconnect();
            await this._TFTP.stopTFTPserver();
        }
        return command;
    }

    async setupCER ({TFTPlistenip, TFTPlistenport=69, TFTPdir, SSLcertFileName})
    {
        let command;
        try {
            SSLcertFileName = SSLcertFileName ? SSLcertFileName : await this.#findCERfile(TFTPdir);
            command = `sslcfg -cert server -upld -i ${TFTPlistenip} -l "${SSLcertFileName}"`;

            this._certFilePath = await this.#checkFile(`${TFTPdir}\\${SSLcertFileName}`);
            await this._TFTP.startTFTPServer({listenip: TFTPlistenip, port: TFTPlistenport, dir: TFTPdir});
            await this.sshConnectIfNotConnected();
            let p_downloadSSL = this._TFTP._waitTFTPdownloadFile();
            let sshout = await this.sshExecCommand(command);
            this._checkSSHout_ok(command, sshout);
            let TFTPdownloadfilename = await p_downloadSSL;
            if (!TFTPdownloadfilename || TFTPdownloadfilename != SSLcertFileName) {
                throw new Error(`File "${TFTPdownloadfilename}" had been downloaded from TFTP server, but expected file "${SSLcertFileName}"`);
            }
        } catch (error) {
            throw error
        } finally {
            await this.sshDisconnect();
            await this._TFTP.stopTFTPserver();
        }
        return command;
    }

    getUploadedCSRFilePath () {
        if (!this._csrFilePath) throw new Error("CSR not load yet!");
        return this._csrFilePath;
    }
};


class mount extends IMM {

    async mountSAMBA ({smbPath, smbUser, smbPassword, smbDomain}) {
        try {
            if (!smbPath || !smbUser || !smbPassword) {
                throw new Error(`mountSAMBA() method needs smbPath, smbUser and smbPassword arguments`);
            }
            let cmd_smbDomain = smbDomain ? `-d ${smbDomain}` : '';
            
            let smbFileName = smbPath.match(/^.+\\(.+?)$/)[1];
            let smbURL= smbPath.replace(/\\/g, "/");
            smbURL=`smb:${smbURL}`;
            let command_map = `rdmount -map -t samba -l ${smbURL} -u ${smbUser} -p ${smbPassword} ${cmd_smbDomain}`;
            await this.sshConnectIfNotConnected();
            let sshout = await this.sshExecCommand(command_map);
            this._checkSSHout_dotok(command_map, sshout);
            sshout = await this.sshExecCommand("rdmount -mount");
            sshout = await this.sshExecCommand("rdmount -maplist");
            if(sshout.stdout.search(new RegExp(smbFileName, "m")) == -1 || sshout.stderr.length > 0) {
                throw new Error(`Mount with command "${command_map}" failed`);
            }
            return command_map;
        } catch (error) {
            throw error
        } finally {
            await this.sshDisconnect();
        }
    }

    async unmountSAMBA (mapid=1) {
        try {
            let command_unmap=`rdmount -unmap ${mapid}`;
            await this.sshConnectIfNotConnected();
            let sshout = await this.sshExecCommand(command_unmap);
            this._checkSSHout_dotok(command_unmap, sshout);
            return command_unmap;
        } catch (error) {
            throw error
        } finally {
            await this.sshDisconnect();
        }
    }
};



module.exports.IMM = IMM;
module.exports.IMM.webssl = webssl;
module.exports.IMM.mount = mount;
