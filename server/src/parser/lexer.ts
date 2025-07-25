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

import { Lexer } from "chevrotain";

import {
  Control,
  Identifier,
  Keyword,
  LSql,
  RSql,
  Reserved,
  System,
} from "./keywords";
import {
  BinaryLiteral,
  ByteLiteral,
  CharLiteral,
  CommentLiteral,
  DateLiteral,
  DateTimeLiteral,
  InfinityLiteral,
  MonthLiteral,
  NumberLiteral,
  SymbolLiteral,
  TimeLiteral,
  TimeStampLiteral,
} from "./literals";
import {
  CommentEnd,
  ExitCommentBegin,
  CommentBegin,
  StringEnd,
  StringBegin,
  TestBegin,
} from "./ranges";
import {
  Colon,
  Command,
  Comparator,
  DoubleColon,
  EndOfLine,
  Iterator,
  LBracket,
  LCurly,
  LParen,
  LineComment,
  Operator,
  Documentation,
  RBracket,
  RCurly,
  RParen,
  SemiColon,
  WhiteSpace,
  StringEscape,
  TestBlock,
  CommentEndOfLine,
  TestLambdaBlock,
  Cond,
  CutDrop,
} from "./tokens";

const Language = [
  Command,
  EndOfLine,
  WhiteSpace,
  SymbolLiteral,
  DateTimeLiteral,
  TimeStampLiteral,
  DateLiteral,
  MonthLiteral,
  TimeLiteral,
  InfinityLiteral,
  BinaryLiteral,
  ByteLiteral,
  NumberLiteral,
  System,
  Control,
  LSql,
  RSql,
  Keyword,
  Reserved,
  Identifier,
  CutDrop,
  Iterator,
  Comparator,
  DoubleColon,
  Operator,
  Cond,
  Colon,
  SemiColon,
  LParen,
  RParen,
  LBracket,
  RBracket,
  LCurly,
  RCurly,
];

export const QLexer = new Lexer(
  {
    defaultMode: "q_mode",
    modes: {
      test_mode: [
        CommentBegin,
        ExitCommentBegin,
        Documentation,
        LineComment,
        StringBegin,
        TestBlock,
        TestLambdaBlock,
        ...Language,
      ],
      q_mode: [
        CommentBegin,
        ExitCommentBegin,
        Documentation,
        LineComment,
        StringBegin,
        TestBegin,
        ...Language,
      ],
      string_mode: [
        StringEscape,
        StringEnd,
        EndOfLine,
        WhiteSpace,
        CharLiteral,
      ],
      comment_mode: [CommentEnd, CommentEndOfLine, WhiteSpace, CommentLiteral],
      exit_comment_mode: [CommentEndOfLine, WhiteSpace, CommentLiteral],
    },
  },
  { safeMode: true, skipValidations: true },
);
