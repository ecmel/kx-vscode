/*
 * Copyright (c) 1998-2025 KX Systems Inc.
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the
 * License. You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an
 * "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the
 * specific language governing permissions and limitations under the License.
 */

import { u16u8, u8u16 } from "./c";
import { TypeBase, TypeNum } from "./typeBase";
import U8 from "./U8";

export default class QChar extends U8 {
  static readonly typeNum = 10;

  constructor(length: number, offset: number, dataView: DataView) {
    super(length, offset, TypeNum.char, dataView);
  }

  static listToIPC(values: Array<string>): Uint8Array {
    const charData = values.map((v) => u8u16(v && v.length ? v[0] : " "));

    const merged = (charData as any).flat();
    const size = charData.length + 6;
    const buffer = TypeBase.createBuffer(size);

    buffer.wb(QChar.typeNum); // type
    buffer.wb(0); // attributes
    buffer.wi(merged.length); // vector size
    merged.forEach((v) => buffer.wb(v)); // values

    return buffer.data;
  }

  static toIPC(value: string): Uint8Array {
    const charData = u8u16(value && value.length ? value[0] : " ");
    const buffer = TypeBase.createBuffer(1 + charData.length);
    buffer.wb(256 - QChar.typeNum); // type
    charData.forEach((c) => buffer.wb(c));
    return buffer.data;
  }

  getValue(i: number): string {
    const c = this.getScalar(i);
    return c === 0 ? "" : u16u8([c]);
  }
}
