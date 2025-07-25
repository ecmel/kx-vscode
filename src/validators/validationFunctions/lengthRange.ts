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

import { IRule } from "../rule";

export class LengthRange implements IRule {
  constructor(private readonly min: number, private readonly max: number) {}

  public validate(value: string): string | null {
    const inRange = value.length >= this.min && value.length <= this.max;
    return inRange
      ? null
      : `Length must be between ${this.min} and ${this.max} characters`;
  }
}
