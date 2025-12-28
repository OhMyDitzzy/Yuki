import { Captcha as CanvafyCaptcha } from "canvafy";

function AutoCleanup(delayMs: number = 60000) {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;

    descriptor.value = async function(this: Captcha, ...args: any[]) {
      const result = await original.apply(this, args);

      setTimeout(() => {
        this.cleanup();
      }, delayMs);

      return result;
    };

    return descriptor;
  };
}

function Cached() {
  return function(target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const original = descriptor.value;

    descriptor.value = async function(this: Captcha, ...args: any[]) {
      if (this.buffer) {
        return this.buffer;
      }

      return await original.apply(this, args);
    };

    return descriptor;
  };
}

export class Captcha {
  public value: string;
  public buffer: Buffer | null = null;

  constructor(length: number = 6) {
    this.value = this.generateCode(length);
  }

  private generateCode(length: number): string {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < length; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }


  @Cached()
  @AutoCleanup(60000)
  async build(options?: {
    background?: string;
    border?: string;
    opacity?: number;
  }): Promise<Buffer> {
    const captcha = await new CanvafyCaptcha()
      .setCaptchaKey(this.value)
      .setBorder(options?.border || "#ffffff")
      .setOverlayOpacity(options?.opacity || 0.7)
      .build();

    this.buffer = captcha;
    return captcha;
  }

  verify(input: string): boolean {
    return this.value.toUpperCase() === input.toUpperCase();
  }

  getBuffer(): Buffer | null {
    return this.buffer;
  }

  cleanup(): void {
    this.buffer = null;
  }
}
