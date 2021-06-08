# node-imm
These are Node.js tool for Lenovo XCC and IBM IMM2 with promises. 
I had goal working with ssl certs, therefore was realized only:
* reboot IMM/XCC
* ssh connect
* creating .csr and upload .cer (from CA) for webUI - don't work with IMM (supports only IMM2 and XCC). With using inner TFTP server.

Maybe, if i obtain feedback and have free time, i will extend and improve this project. But it will not fast:) 

# Examples
Reboot IMM2/XCC:
```
const IMM = require('./imm.js').IMM;
let imm = new IMM("imm1.example.ru");
await imm.immRestart({sshUser: argv.user, sshPassword: argv.password});
```
Connect and execute cmd (get fans status):
```
let imm = new IMM("imm1.example.ru");
await imm.sshConnect({sshUser: argv.user, sshPassword: argv.password});
let out = await imm.sshExecCommand("fans");
console.log(`STDOUT: "${out.stdout}"`);
console.log(`STDERR: "${out.stderr}"`);
imm.sshDisconnect();
```
Generate and download .csr for webUI:
```
let ssl = new IMM.webssl("imm1.example.ru");
let execcommand = await ssl.generateCSR({sshUser: argv.user, sshPassword: argv.password, csrCPerson: "Ivanov A.V.", csrCEmail: "iav@mail.ru", csrOrgUnit: "IT", csrDomainQ: "example.ru"});
execcommand = await ssl.uploadCSR({TFTPlistenip: "192.168.1.124", TFTPdir: "D:\\user1\\tftpdir"});
```
Upload certificate (.csr file) from CA to IMM2/XCC. If csr filename don't pass in setupCER(), method will try find .csr file with proper hostname in TFTPdir:
```
let ssl = new IMM.webssl("imm1.example.ru");
let execcommand = await ssl.setupCER({sshUser: argv.user, sshPassword: argv.password, TFTPlistenip: argv.ftplistenip, TFTPdir: argv.dir});
if (await ssl.getIMMtype({})  == 'IMM2') 
{
  await new Promise((resolve, reject) => setTimeout(resolve, 1000*15));
  await ssl.immRestart({}); 
}
```

# Dependencies
[fs](https://nodejs.org/api/fs.html), [fs/promises](https://nodejs.org/api/fs.html), [ssh2](https://www.npmjs.com/package/ssh2#client-methods), [tftp](https://www.npmjs.com/package/tftp#server_close)
```
npm install ssh2 tftp
```
