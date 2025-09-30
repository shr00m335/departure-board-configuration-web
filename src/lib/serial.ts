enum OpCode {
	DeviceStatus,
	Restart,
	ScanWiFi,
	SetWiFi,
	GetConnectedSSID,
	GetSavedSSID,
	GetSavedPassword,
	GetIP,
	SetStation,
	SetLine,
	GetStationId,
	GetStationName,
	GetLine,
	ConfigMode,
	SetRotation,
	GetRotation,
	Echo,
	ResetConfig
}

class USBSerial {
	port: SerialPort;
	logBuffer: Uint8Array | null = null;
	reader: ReadableStreamDefaultReader<Uint8Array>;
	isReadingLog: boolean = false;

	constructor(port: SerialPort) {
		this.port = port;
		this.reader = this.port.readable!.getReader();
	}

	public static async connect(baudRate: number): Promise<USBSerial> {
		const port: SerialPort = await navigator.serial.requestPort();
		if (!port.readable) {
			await port.open({ baudRate });
		}
		const info: SerialPortInfo = port.getInfo();
		console.info(`Connected to device (PID: ${info.usbProductId}, VID: ${info.usbProductId})`);
		return new USBSerial(port);
	}

	private async sendData(data: number[]): Promise<void> {
		const writer = this.port.writable!.getWriter();
		await writer.write(new Uint8Array(data));
		console.info('Data sent:', data);
		await writer.releaseLock();
	}

	private async readData(): Promise<Uint8Array> {
		const { value, done } = await this.reader.read();
		console.info(
			'Data received:',
			value?.map((x) => x)
		);
		return value ?? new Uint8Array();
	}

	public getDeviceInfo(): string {
		const info: SerialPortInfo = this.port.getInfo();
		return `PID: ${info.usbProductId}; VID: ${info.usbVendorId}`;
	}

	public async readLog(): Promise<string> {
		const data: Uint8Array = this.logBuffer === null ? await this.readData() : this.logBuffer;
		this.logBuffer = null;
		if (!this.isReadingLog) return '';
		if (data[0] !== 0xff) return this.readLog();
		const logLength: number = data[1];
		const result: Uint8Array = new Uint8Array(logLength);
		result.set(data.subarray(2));
		let currentLength: number = data.length - 2;
		while (currentLength < logLength) {
			const extraData: Uint8Array = await this.readData();
			const endIndex: number = Math.min(32, logLength - currentLength);
			result.set(extraData.subarray(0, endIndex), currentLength);
			currentLength += extraData.length;
			if (currentLength >= logLength && endIndex < 32) {
				this.logBuffer = extraData.subarray(endIndex);
			}
		}
		return new TextDecoder().decode(result);
	}

	public stopReadingLog(): void {
		this.isReadingLog = false;
	}

	public startReadingLog(): void {
		this.isReadingLog = true;
	}

	public async handShake(): Promise<boolean> {
		const handshakeLength = 5;
		const data: number[] = [OpCode.Echo, handshakeLength];
		for (let i: number = 0; i < handshakeLength; i++) {
			data.push(Math.floor(Math.random() * 0xff));
		}
		await this.sendData(data);
		let res: Uint8Array = await this.readData();
		while (res[0] > 0x01) {
			res = await this.readData();
		}
		if (res[0] === 0x01) return false;
		if (res[1] !== handshakeLength) return false;
		for (let i = 0; i < handshakeLength; i++) {
			if (res[i + 2] !== data[i + 2]) {
				return false;
			}
		}
		return true;
	}

	public async echo(data: number[]): Promise<void> {
		const payload: number[] = [OpCode.Echo, data.length, ...data];
		await this.sendData(payload);
	}

	public async getIPAddress(): Promise<string> {
		const data: number[] = [OpCode.GetIP];
		await this.sendData(data);
		let res: Uint8Array = await this.readData();
		while (res[0] > 0x01) {
			res = await this.readData();
		}
		if (res[0] === 0x01 || res[1] !== 0x03) return '';
		return `${res[2]}.${res[3]}.${res[4]}.${res[5]}`;
	}

	private async readString(): Promise<string> {
		let res: Uint8Array = await this.readData();
		while (res[0] > 0x01) {
			res = await this.readData();
		}
		if (res[0] === 0x01 || res[1] === 0x00) return '';
		const strLen: number = res[1];
		return new TextDecoder().decode(res.subarray(2, 2 + strLen)).trim();
	}

	public async getWiFiSSID(): Promise<string> {
		const data: number[] = [OpCode.GetSavedSSID];
		await this.sendData(data);
		return await this.readString();
	}

	public async getWiFiPassword(): Promise<string> {
		const data: number[] = [OpCode.GetSavedPassword];
		await this.sendData(data);
		return await this.readString();
	}

	public async getStationId(): Promise<string> {
		const data: number[] = [OpCode.GetStationId];
		await this.sendData(data);
		return await this.readString();
	}

	public async getLineId(): Promise<string> {
		const data: number[] = [OpCode.GetLine];
		await this.sendData(data);
		return await this.readString();
	}

	public async getRotation(): Promise<boolean> {
		await this.sendData([OpCode.GetRotation]);
		const response: Uint8Array = await this.readData();
		return response[1] === 1;
	}

	private async readReturnStatus(): Promise<boolean> {
		console.log('Reading status');
		let res: Uint8Array = await this.readData();
		console.log('Res: ', res);
		while (res[0] > 0x01) {
			res = await this.readData();
		}
		return !res[0];
	}

	public async setWiFi(ssid: string, password: string): Promise<boolean> {
		let data: number[] = [OpCode.SetWiFi];
		data.push(ssid.length);
		data = [...data, ...new TextEncoder().encode(ssid)];
		data.push(password.length);
		data = [...data, ...new TextEncoder().encode(password)];
		await this.sendData(data);
		return this.readReturnStatus();
	}

	public async setStation(stationId: string, stationName: string): Promise<boolean> {
		let data: number[] = [OpCode.SetStation];
		data.push(stationId.length);
		data = [...data, ...new TextEncoder().encode(stationId)];
		data.push(stationName.length);
		data = [...data, ...new TextEncoder().encode(stationName)];
		await this.sendData(data);
		return this.readReturnStatus();
	}

	public async setLine(lineId: string): Promise<boolean> {
		let data: number[] = [OpCode.SetLine];
		data.push(lineId.length);
		data = [...data, ...new TextEncoder().encode(lineId)];
		await this.sendData(data);
		return this.readReturnStatus();
	}

	public async enterConfigMode(): Promise<boolean> {
		let data: number[] = [OpCode.ConfigMode];
		await this.sendData(data);
		return this.readReturnStatus();
	}

	public async setRotation(inverted: boolean): Promise<boolean> {
		let data: number[] = [OpCode.SetRotation, inverted ? 1 : 0];
		await this.sendData(data);
		return this.readReturnStatus();
	}

	public async restartDevice(): Promise<void> {
		await this.sendData([OpCode.Restart]);
	}
}

export default USBSerial;
