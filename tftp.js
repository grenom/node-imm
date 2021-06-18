const tftp = require("tftp");

class TFTPServer {
    #ftpserver;
    #connections;

    async startTFTPServer ({listenip, port=69, dir}) {
        this.#ftpserver = tftp.createServer ({ host: listenip, port, denyPUT: false, root: dir});
        let p_listen = new Promise ((resolve, reject) => {
            this.#ftpserver.once("error", error => {reject(`Main socket TFTP server error: "${error}"`)});
            this.#ftpserver.once("listening", () => resolve());
        });
        this.#ftpserver.listen();
        return p_listen;
    }

    async _waitTFTPuploadFile () {
        return new Promise ((resolve, reject) => {
            this.#ftpserver.once('request', (req, res) => {
                let remotehost = req.stats.remoteAddress;
                if (req.method == "PUT") {
                    let filename = req.file;
                    req.once('end', () => resolve(filename));   
                }
                req.once ('error', (error) => reject(`query error occur to TFTP server: ${error}`));
            });
        });
    }

    async _waitTFTPdownloadFile () {
        return new Promise ((resolve, reject) => {
            this.#ftpserver.once('request', (req, res) => {
                let remotehost = req.stats.remoteAddress;
                if (req.method == "GET") {
                    let filename = req.file;
                    req.once('close', () => resolve(filename));
                }
                req.once ('error', (error) => reject(`query error occur to TFTP server: ${error}`));
            });
            //console.debug("DEBUG: waitTFTPdownloadFile init.");
        });
    }

    async stopTFTPserver () {
        if (this.#ftpserver)
        {
            let p_close_tftpserver = new Promise ((resolve, reject) => {
                this.#ftpserver.once('close', () => {
                    resolve();
                    this.#ftpserver=undefined;
                });
            });
            this.#ftpserver.close();
            return p_close_tftpserver;
        }
        return true;
    }
}



module.exports.TFTPServer = TFTPServer;