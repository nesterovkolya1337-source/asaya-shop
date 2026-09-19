-- Exact approved Figma content. User clarified: retain all lower blocks; hero/footer unchanged.
-- Additive enrichment only. Existing PDP edits win; canonical tables are not updated.
WITH templates AS (
 SELECT value->>'sku' AS sku,value->'pdp' AS pdp FROM jsonb_array_elements($pdp$
[
 {
  "sku": "1S-BA-02-02",
  "pdp": {
   "version": 1,
   "node": "300:1010",
   "sections": [
    {
     "kind": "result",
     "title": "Мягкое очищение и увлажнение",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/b9d0a4b78ad5f68857451710d3840b15f2b0bbaa50ce3937c792dc678c198dfb.png",
       "layout": {
        "x": -15.18556,
        "y": -24.84455,
        "width": 157.32189,
        "height": 193.04591,
        "rotation": 180.0,
        "flipX": false,
        "flipY": true
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": [
      {
       "title": "",
       "body": "не нарушает естественный баланс кожи"
      },
      {
       "title": "",
       "body": "не оставляет чувства стянутости и дискомфорта"
      },
      {
       "title": "",
       "body": "гладкая и упрегая кожа на ощупь"
      }
     ]
    },
    {
     "kind": "howTo",
     "title": "Как использовать",
     "body": "",
     "additionalBody": "",
     "media": [],
     "items": [
      {
       "title": "",
       "body": "Нанесите каплю геля, превращая ее в воздушную пену",
       "media": {
        "src": "/images/pdp-v3/7d7e9343aa0cc0dba124e4057ed3da11608066247533cf833937973bbb6e2e60.png",
        "layout": {
         "x": -47.0092,
         "y": -21.23148,
         "width": 183.30391,
         "height": 151.6813,
         "rotation": -16.92,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Мягкая ароматная пена очищает и увлажняет кожу",
       "media": {
        "src": "/images/pdp-v3/20596d8d9315e7bc31b9215cd58060c72310253ea3573b68043b7a1b3b736bf5.png",
        "layout": {
         "x": -18.0069,
         "y": -14.47593,
         "width": 139.98046,
         "height": 150.36704,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Смойте, ощущая гладкость и питание кожи",
       "media": {
        "src": "/images/pdp-v3/78a6bbf152da7b7cd327757a9c422d7a014c1c37376370bfd35af7f5c66b402b.png",
        "layout": {
         "x": -0.4046,
         "y": 0.0,
         "width": 100.81034,
         "height": 111.31056,
         "rotation": 180.0,
         "flipX": false,
         "flipY": true
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Наслаждайтесь свежестью и комфортом после душа",
       "media": {
        "src": "/images/pdp-v3/eb1b79b7a283de66e9c0adc601ce1ba2dbe957309bbcaf71a923ee0e5b953093.jpg",
        "layout": {
         "x": 7.22529,
         "y": -36.76667,
         "width": 125.0669,
         "height": 151.06611,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      }
     ]
    },
    {
     "kind": "lifehack",
     "title": "",
     "body": "Вспеньте гель с небольшим количеством воды в ладонях или на мочалке — так вы получите больше воздушной пены и уменьшите расход продукта",
     "additionalBody": "",
     "media": [],
     "items": []
    },
    {
     "kind": "fragrance",
     "title": "",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/6b2e3bb073b0ce8070a531a63e9344c6e9a905da723ed7305a96814292297c4d.png"
      }
     ],
     "items": [
      {
       "title": "Верхние ноты",
       "body": "освежающая кислинка лимонада и брызги сочного лимона"
      },
      {
       "title": "Ноты сердца",
       "body": "горсть красных ягод, спелая, сладкая гуава и тропический бриз"
      },
      {
       "title": "Базовые данные",
       "body": "лёгкий древесный аккорд"
      }
     ]
    },
    {
     "kind": "ingredients",
     "title": "Кератин, аминокислотный комплекс, термозащитные и разглаживающие компоненты",
     "body": "Кератин помогает сделать волосы более плотными и гладкими, аминокислоты поддерживают увлажнённость и эластичность, а разглаживающие компоненты уменьшают пушение и облегчают укладку",
     "additionalBody": "Также содержит экстракт персика и термозащитные компоненты",
     "media": [
      {
       "src": "/images/pdp-v3/f763b88ce5d0e611574ccd5997acd6ef1438e6031fee61eb4ef602f2e9117554.png",
       "layout": {
        "x": -27.36056,
        "y": -148.75625,
        "width": 191.62278,
        "height": 436.51337,
        "rotation": -7.5,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": []
    },
    {
     "kind": "faq",
     "title": "FAQ",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/e3fd9896873120eace1c59999cd4a16d586ef92b265ab1623a0587311837d301.png"
      }
     ],
     "items": [
      {
       "title": "Оставляет ли гель ощущение стянутости после душа?",
       "body": ""
      },
      {
       "title": "Подходит ли для ежедневного использования?",
       "body": ""
      },
      {
       "title": "Не сушит ли гель кожу?",
       "body": ""
      },
      {
       "title": "Хорошо ли гель пенится?",
       "body": ""
      },
      {
       "title": "Есть ли в составе ухаживающие компоненты?",
       "body": ""
      }
     ]
    }
   ],
   "recommendations": [
    "1S-BA-02-01",
    "1S-BA-02-04",
    "1S-BA-03",
    "1S-BA-01"
   ]
  }
 },
 {
  "sku": "1S-BA-02-01",
  "pdp": {
   "version": 1,
   "node": "315:1453",
   "sections": [
    {
     "kind": "result",
     "title": "Мягкое очищение и увлажнение",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/4fc255d4cbe2ce8c3552c9b1e30768192614c4e36dd0d6d45a5577c64f55e4e2.jpg",
       "layout": {
        "x": 0.0,
        "y": -6.81818,
        "width": 120.521,
        "height": 147.85782,
        "rotation": 0,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": [
      {
       "title": "",
       "body": "не нарушает естественный баланс кожи"
      },
      {
       "title": "",
       "body": "не оставляет чувства стянутости и дискомфорта"
      },
      {
       "title": "",
       "body": "гладкая и упрегая кожа на ощупь"
      }
     ]
    },
    {
     "kind": "howTo",
     "title": "Как использовать",
     "body": "",
     "additionalBody": "",
     "media": [],
     "items": [
      {
       "title": "",
       "body": "Нанесите каплю геля, превращая ее в воздушную пену",
       "media": {
        "src": "/images/pdp-v3/e48f79529ceb37c01047436f60010f301586a51afe2119ef06ff38f175af5ae2.png",
        "layout": {
         "x": -46.96552,
         "y": -20.94815,
         "width": 183.85471,
         "height": 152.11574,
         "rotation": -16.92,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Мягкая ароматная пена очищает и увлажняет кожу",
       "media": {
        "src": "/images/pdp-v3/d892df3afef4f5db826b7ae287db82ca7fbc9f79e199df85377d402efdb98a3e.png",
        "layout": {
         "x": -45.88506,
         "y": -21.32963,
         "width": 198.67816,
         "height": 182.80056,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Смойте, ощущая гладкость и питание кожи",
       "media": {
        "src": "/images/pdp-v3/78a6bbf152da7b7cd327757a9c422d7a014c1c37376370bfd35af7f5c66b402b.png",
        "layout": {
         "x": -0.4046,
         "y": 0.0,
         "width": 100.81034,
         "height": 111.31056,
         "rotation": 180.0,
         "flipX": false,
         "flipY": true
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Наслаждайтесь свежестью и комфортом после душа",
       "media": {
        "src": "/images/pdp-v3/eb1b79b7a283de66e9c0adc601ce1ba2dbe957309bbcaf71a923ee0e5b953093.jpg",
        "layout": {
         "x": 7.22529,
         "y": -36.76667,
         "width": 125.0669,
         "height": 151.06611,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      }
     ]
    },
    {
     "kind": "lifehack",
     "title": "",
     "body": "Вспеньте гель с небольшим количеством воды в ладонях или на мочалке — так вы получите больше воздушной пены и уменьшите расход продукта",
     "additionalBody": "",
     "media": [],
     "items": []
    },
    {
     "kind": "fragrance",
     "title": "",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/0ff826ae3b813c524bfa313f717d1b2aa86db8910d724c0dba9cd3591844c705.png"
      }
     ],
     "items": [
      {
       "title": "Верхние ноты",
       "body": "игривая сладость сахарной ваты и аромат спелой лесной клубники"
      },
      {
       "title": "Ноты сердца",
       "body": "нежный розовый зефир с лёгкой карамельной корочкой от костра"
      },
      {
       "title": "Базовые данные",
       "body": "уютный аккорд томлёной ванили"
      }
     ]
    },
    {
     "kind": "ingredients",
     "title": "Кератин, аминокислотный комплекс, термозащитные и разглаживающие компоненты",
     "body": "Кератин помогает сделать волосы более плотными и гладкими, аминокислоты поддерживают увлажнённость и эластичность, а разглаживающие компоненты уменьшают пушение и облегчают укладку",
     "additionalBody": "Также содержит экстракт персика и термозащитные компоненты",
     "media": [
      {
       "src": "/images/pdp-v3/7da36bc157fdd9ea112da6e397111fbcb1ae444db747eaf530be26ada331afc2.png",
       "layout": {
        "x": -29.89778,
        "y": -188.655,
        "width": 207.60561,
        "height": 536.31038,
        "rotation": -19.22,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": []
    },
    {
     "kind": "faq",
     "title": "FAQ",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/e3fd9896873120eace1c59999cd4a16d586ef92b265ab1623a0587311837d301.png"
      }
     ],
     "items": [
      {
       "title": "Оставляет ли гель ощущение стянутости после душа?",
       "body": ""
      },
      {
       "title": "Подходит ли для ежедневного использования?",
       "body": ""
      },
      {
       "title": "Не сушит ли гель кожу?",
       "body": ""
      },
      {
       "title": "Хорошо ли гель пенится?",
       "body": ""
      },
      {
       "title": "Есть ли в составе ухаживающие компоненты?",
       "body": ""
      }
     ]
    }
   ],
   "recommendations": [
    "1S-BA-02-01",
    "1S-BA-02-04",
    "1S-BA-03",
    "1S-BA-01"
   ]
  }
 },
 {
  "sku": "1S-BA-02-04",
  "pdp": {
   "version": 1,
   "node": "315:1859",
   "sections": [
    {
     "kind": "result",
     "title": "Мягкое очищение и увлажнение",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/dd69e5ca12ef272377677aa3829d98c2494cefa2feee5c624a1a037b9f541ce9.png",
       "layout": {
        "x": -3.19667,
        "y": -18.86182,
        "width": 118.326,
        "height": 145.19018,
        "rotation": 0,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": [
      {
       "title": "",
       "body": "не нарушает естественный баланс кожи"
      },
      {
       "title": "",
       "body": "не оставляет чувства стянутости и дискомфорта"
      },
      {
       "title": "",
       "body": "гладкая и упрегая кожа на ощупь"
      }
     ]
    },
    {
     "kind": "howTo",
     "title": "Как использовать",
     "body": "",
     "additionalBody": "",
     "media": [],
     "items": [
      {
       "title": "",
       "body": "Нанесите каплю геля, превращая ее в воздушную пену",
       "media": {
        "src": "/images/pdp-v3/5c3a2819aa12a6d5ff8fda3828ce4f5f5e85b9d9d8541745ba0982e6e579cddf.png",
        "layout": {
         "x": -47.03218,
         "y": -20.80556,
         "width": 183.35632,
         "height": 151.74167,
         "rotation": -16.92,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Мягкая ароматная пена очищает и увлажняет кожу",
       "media": {
        "src": "/images/pdp-v3/20596d8d9315e7bc31b9215cd58060c72310253ea3573b68043b7a1b3b736bf5.png",
        "layout": {
         "x": -18.0069,
         "y": -14.47593,
         "width": 139.98046,
         "height": 150.36704,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Смойте, ощущая гладкость и питание кожи",
       "media": {
        "src": "/images/pdp-v3/78a6bbf152da7b7cd327757a9c422d7a014c1c37376370bfd35af7f5c66b402b.png",
        "layout": {
         "x": -0.4046,
         "y": 0.0,
         "width": 100.81034,
         "height": 111.31056,
         "rotation": 180.0,
         "flipX": false,
         "flipY": true
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Наслаждайтесь свежестью и комфортом после душа",
       "media": {
        "src": "/images/pdp-v3/eb1b79b7a283de66e9c0adc601ce1ba2dbe957309bbcaf71a923ee0e5b953093.jpg",
        "layout": {
         "x": 7.22529,
         "y": -36.76667,
         "width": 125.0669,
         "height": 151.06611,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      }
     ]
    },
    {
     "kind": "lifehack",
     "title": "",
     "body": "Вспеньте гель с небольшим количеством воды в ладонях или на мочалке — так вы получите больше воздушной пены и уменьшите расход продукта",
     "additionalBody": "",
     "media": [],
     "items": []
    },
    {
     "kind": "fragrance",
     "title": "",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/622e37ce743831bd8136483b4e82ab20d6224c2f692d3a49d6616cb75cef3b95.png"
      }
     ],
     "items": [
      {
       "title": "Верхние ноты",
       "body": "хрустальная свежесть зеленого яблока и брызги лайма"
      },
      {
       "title": "Ноты сердца",
       "body": "спелое киви и нежное послевкусие тропических фруктов"
      },
      {
       "title": "Базовые данные",
       "body": "прохлада мятного листа"
      }
     ]
    },
    {
     "kind": "ingredients",
     "title": "Кератин, аминокислотный комплекс, термозащитные и разглаживающие компоненты",
     "body": "Кератин помогает сделать волосы более плотными и гладкими, аминокислоты поддерживают увлажнённость и эластичность, а разглаживающие компоненты уменьшают пушение и облегчают укладку",
     "additionalBody": "Также содержит экстракт персика и термозащитные компоненты",
     "media": [
      {
       "src": "/images/pdp-v3/56c2be6b22c416e426451624fcf8ab5ed4424ca79a850e1545a4415195a60f51.png",
       "layout": {
        "x": -27.55833,
        "y": -153.7425,
        "width": 187.75083,
        "height": 461.48388,
        "rotation": -27.83,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": []
    },
    {
     "kind": "faq",
     "title": "FAQ",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/e3fd9896873120eace1c59999cd4a16d586ef92b265ab1623a0587311837d301.png"
      }
     ],
     "items": [
      {
       "title": "Оставляет ли гель ощущение стянутости после душа?",
       "body": ""
      },
      {
       "title": "Подходит ли для ежедневного использования?",
       "body": ""
      },
      {
       "title": "Не сушит ли гель кожу?",
       "body": ""
      },
      {
       "title": "Хорошо ли гель пенится?",
       "body": ""
      },
      {
       "title": "Есть ли в составе ухаживающие компоненты?",
       "body": ""
      }
     ]
    }
   ],
   "recommendations": [
    "1S-BA-02-01",
    "1S-BA-02-04",
    "1S-BA-03",
    "1S-BA-01"
   ]
  }
 },
 {
  "sku": "1S-BA-02-03",
  "pdp": {
   "version": 1,
   "node": "315:2680",
   "sections": [
    {
     "kind": "result",
     "title": "Мягкое очищение и увлажнение",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/4157ec0eeff27d3f4a04b58118cc30daaac540152a25b8d8c73e7752c3107f54.png",
       "layout": {
        "x": -75.68778,
        "y": -51.12636,
        "width": 223.79256,
        "height": 222.33936,
        "rotation": 0,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": [
      {
       "title": "",
       "body": "не нарушает естественный баланс кожи"
      },
      {
       "title": "",
       "body": "не оставляет чувства стянутости и дискомфорта"
      },
      {
       "title": "",
       "body": "гладкая и упрегая кожа на ощупь"
      }
     ]
    },
    {
     "kind": "howTo",
     "title": "Как использовать",
     "body": "",
     "additionalBody": "",
     "media": [],
     "items": [
      {
       "title": "",
       "body": "Нанесите каплю геля, превращая ее в воздушную пену",
       "media": {
        "src": "/images/pdp-v3/bb708b9773c14e6542e6ed9b91ccd6141b5f022d1d787d2442febf8d10ff499c.png",
        "layout": {
         "x": -46.68506,
         "y": -20.92593,
         "width": 182.77563,
         "height": 151.22648,
         "rotation": -16.92,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Мягкая ароматная пена очищает и увлажняет кожу",
       "media": {
        "src": "/images/pdp-v3/20596d8d9315e7bc31b9215cd58060c72310253ea3573b68043b7a1b3b736bf5.png",
        "layout": {
         "x": -18.0069,
         "y": -14.47593,
         "width": 139.98046,
         "height": 150.36704,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Смойте, ощущая гладкость и питание кожи",
       "media": {
        "src": "/images/pdp-v3/78a6bbf152da7b7cd327757a9c422d7a014c1c37376370bfd35af7f5c66b402b.png",
        "layout": {
         "x": -0.4046,
         "y": 0.0,
         "width": 100.81034,
         "height": 111.31056,
         "rotation": 180.0,
         "flipX": false,
         "flipY": true
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Наслаждайтесь свежестью и комфортом после душа",
       "media": {
        "src": "/images/pdp-v3/eb1b79b7a283de66e9c0adc601ce1ba2dbe957309bbcaf71a923ee0e5b953093.jpg",
        "layout": {
         "x": 7.22529,
         "y": -36.76667,
         "width": 125.0669,
         "height": 151.06611,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      }
     ]
    },
    {
     "kind": "lifehack",
     "title": "",
     "body": "Вспеньте гель с небольшим количеством воды в ладонях или на мочалке — так вы получите больше воздушной пены и уменьшите расход продукта",
     "additionalBody": "",
     "media": [],
     "items": []
    },
    {
     "kind": "fragrance",
     "title": "",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/a0515816e24e9d95aee6b7a8f60c05aca7ad59316e95a6d877400e3ca296ef13.png"
      }
     ],
     "items": [
      {
       "title": "Верхние ноты",
       "body": "сочная лесная черника с её яркой, освежающей кислинкой"
      },
      {
       "title": "Ноты сердца",
       "body": "нежный цветочный аккорд василька"
      },
      {
       "title": "Базовые данные",
       "body": "мягкий аккорд нежного йогурта"
      }
     ]
    },
    {
     "kind": "ingredients",
     "title": "Кератин, аминокислотный комплекс, термозащитные и разглаживающие компоненты",
     "body": "Кератин помогает сделать волосы более плотными и гладкими, аминокислоты поддерживают увлажнённость и эластичность, а разглаживающие компоненты уменьшают пушение и облегчают укладку",
     "additionalBody": "Также содержит экстракт персика и термозащитные компоненты",
     "media": [
      {
       "src": "/images/pdp-v3/1b0acf848f72bdf7496fbf2f3ec4e4c1cf788c6bba3036233e536581268c229e.png",
       "layout": {
        "x": -42.16111,
        "y": -202.43875,
        "width": 228.38511,
        "height": 558.87738,
        "rotation": -28.64,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": []
    },
    {
     "kind": "faq",
     "title": "FAQ",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/e3fd9896873120eace1c59999cd4a16d586ef92b265ab1623a0587311837d301.png"
      }
     ],
     "items": [
      {
       "title": "Оставляет ли гель ощущение стянутости после душа?",
       "body": ""
      },
      {
       "title": "Подходит ли для ежедневного использования?",
       "body": ""
      },
      {
       "title": "Не сушит ли гель кожу?",
       "body": ""
      },
      {
       "title": "Хорошо ли гель пенится?",
       "body": ""
      },
      {
       "title": "Есть ли в составе ухаживающие компоненты?",
       "body": ""
      }
     ]
    }
   ],
   "recommendations": [
    "1S-BA-02-01",
    "1S-BA-02-04",
    "1S-BA-03",
    "1S-BA-01"
   ]
  }
 },
 {
  "sku": "1S-BA-02-05",
  "pdp": {
   "version": 1,
   "node": "315:3149",
   "sections": [
    {
     "kind": "result",
     "title": "Мягкое очищение и увлажнение",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/bb5a4f8170f052be04c8bdc42a2c4635b0648852c0a1a260a8708f710e701382.png",
       "layout": {
        "x": -4.82,
        "y": 0.0,
        "width": 145.804,
        "height": 178.89909,
        "rotation": 0,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": [
      {
       "title": "",
       "body": "не нарушает естественный баланс кожи"
      },
      {
       "title": "",
       "body": "не оставляет чувства стянутости и дискомфорта"
      },
      {
       "title": "",
       "body": "гладкая и упругая кожа на ощупь"
      }
     ]
    },
    {
     "kind": "howTo",
     "title": "Как использовать",
     "body": "",
     "additionalBody": "",
     "media": [],
     "items": [
      {
       "title": "",
       "body": "Нанесите каплю геля, превращая ее в воздушную пену",
       "media": {
        "src": "/images/pdp-v3/fd40283f5afc518157ba74aa15ecbdd737b8d6f8c728be2bf8e7dde0b5dfdc34.png",
        "layout": {
         "x": -47.0046,
         "y": -20.8,
         "width": 183.28782,
         "height": 151.685,
         "rotation": -16.92,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Мягкая ароматная пена очищает и увлажняет кожу",
       "media": {
        "src": "/images/pdp-v3/20596d8d9315e7bc31b9215cd58060c72310253ea3573b68043b7a1b3b736bf5.png",
        "layout": {
         "x": -18.0069,
         "y": -14.47593,
         "width": 139.98046,
         "height": 150.36704,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Смойте, ощущая гладкость и питание кожи",
       "media": {
        "src": "/images/pdp-v3/78a6bbf152da7b7cd327757a9c422d7a014c1c37376370bfd35af7f5c66b402b.png",
        "layout": {
         "x": -0.4046,
         "y": 0.0,
         "width": 100.81034,
         "height": 111.31056,
         "rotation": 180.0,
         "flipX": false,
         "flipY": true
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Наслаждайтесь свежестью и комфортом после душа",
       "media": {
        "src": "/images/pdp-v3/eb1b79b7a283de66e9c0adc601ce1ba2dbe957309bbcaf71a923ee0e5b953093.jpg",
        "layout": {
         "x": 7.22529,
         "y": -36.76667,
         "width": 125.0669,
         "height": 151.06611,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      }
     ]
    },
    {
     "kind": "lifehack",
     "title": "",
     "body": "Вспеньте гель с небольшим количеством воды в ладонях или на мочалке — так вы получите больше воздушной пены и уменьшите расход продукта",
     "additionalBody": "",
     "media": [],
     "items": []
    },
    {
     "kind": "fragrance",
     "title": "",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/14c895a9f3e8b6c8eb6dbc41c675af417ec0cb0830a1619927c7a9cc86d0aa9d.png"
      }
     ],
     "items": [
      {
       "title": "Верхние ноты",
       "body": "освежающая цедра юзу и искрящиеся нотки бергамота"
      },
      {
       "title": "Ноты сердца",
       "body": "нежный флер цветков юдзу и сочные аккорды мандарина"
      },
      {
       "title": "Базовые данные",
       "body": "теплая амбра и бархатистая древесина сандала"
      }
     ]
    },
    {
     "kind": "ingredients",
     "title": "Кератин, аминокислотный комплекс, термозащитные и разглаживающие компоненты",
     "body": "Кератин помогает сделать волосы более плотными и гладкими, аминокислоты поддерживают увлажнённость и эластичность, а разглаживающие компоненты уменьшают пушение и облегчают укладку",
     "additionalBody": "Также содержит экстракт персика и термозащитные компоненты",
     "media": [
      {
       "src": "/images/pdp-v3/4d02aab21fd2b74e0733ec98cd6f6c0e219ffd5dea088a5c64cfea83878b6387.png",
       "layout": {
        "x": -37.39111,
        "y": -180.38375,
        "width": 219.71217,
        "height": 533.76725,
        "rotation": -29.99,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": []
    },
    {
     "kind": "faq",
     "title": "FAQ",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/e3fd9896873120eace1c59999cd4a16d586ef92b265ab1623a0587311837d301.png"
      }
     ],
     "items": [
      {
       "title": "Оставляет ли гель ощущение стянутости после душа?",
       "body": ""
      },
      {
       "title": "Подходит ли для ежедневного использования?",
       "body": ""
      },
      {
       "title": "Не сушит ли гель кожу?",
       "body": ""
      },
      {
       "title": "Хорошо ли гель пенится?",
       "body": ""
      },
      {
       "title": "Есть ли в составе ухаживающие компоненты?",
       "body": ""
      }
     ]
    }
   ],
   "recommendations": [
    "1S-BA-02-01",
    "1S-BA-02-04",
    "1S-BA-03",
    "1S-BA-01"
   ]
  }
 },
 {
  "sku": "1S-FL-02",
  "pdp": {
   "version": 1,
   "node": "334:1380",
   "sections": [
    {
     "kind": "result",
     "title": "Разглаживание, увлажнение и упругость",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/9b7e676744eb6872e2eb6ec600c0651f5b6ff9a7e61385f3d5b33114ccc0184c.png",
       "layout": {
        "x": -22.88778,
        "y": -29.32636,
        "width": 151.96178,
        "height": 186.39582,
        "rotation": 0,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": [
      {
       "title": "",
       "body": "кожа выглядит более гладкой и подтянутой"
      },
      {
       "title": "",
       "body": "становится мягкой, упругой и увлажнённой"
      },
      {
       "title": "",
       "body": "уменьшается ощущение сухости и признаки усталости"
      }
     ]
    },
    {
     "kind": "howTo",
     "title": "Как использовать",
     "body": "",
     "additionalBody": "",
     "media": [],
     "items": [
      {
       "title": "",
       "body": "Нанесите каплю геля, превращая ее в воздушную пену",
       "media": {
        "src": "/images/pdp-v3/248c80bc76960a53cad504f0b3e37cd7832a500995267f5c4f346a5411658b25.png",
        "layout": {
         "x": -20.71264,
         "y": -17.9463,
         "width": 141.21471,
         "height": 151.62056,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Мягкая ароматная пена очищает и увлажняет кожу",
       "media": {
        "src": "/images/pdp-v3/273c2adf684e671b61b661d0d478e649dd04ca418227b696a95ae209ccb8b51e.png",
        "layout": {
         "x": -12.2023,
         "y": -60.5537,
         "width": 151.40989,
         "height": 168.82741,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Смойте, ощущая гладкость и питание кожи",
       "media": {
        "src": "/images/pdp-v3/929559bcea2702fbe32242b093c6ba65a4e51d154ffcb6988e75e24e1068f286.png",
        "layout": {
         "x": 0.0,
         "y": -5.18704,
         "width": 93.79494,
         "height": 113.27889,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Наслаждайтесь свежестью и комфортом после душа",
       "media": {
        "src": "/images/pdp-v3/f2de613f621543eed9e7a6e870362a32ff9e2335123d7f0c668be04312237e7c.png",
        "layout": {
         "x": -29.67126,
         "y": -34.75741,
         "width": 159.13931,
         "height": 192.24556,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      }
     ]
    },
    {
     "kind": "lifehack",
     "title": "",
     "body": "Мягко распределите крем по массажным линиям — от центра лица к периферии. Это помогает улучшить микроциркуляцию и уменьшить ощущение отёчности",
     "additionalBody": "",
     "media": [],
     "items": []
    },
    {
     "kind": "feature",
     "title": "Почему «Лифтинг»?",
     "body": "Комплекс активных компонентов помогает коже выглядеть более гладкой, упругой и подтянутой. Пептид способствует разглаживанию мимических морщин, а гиалуроновая кислота, ниацинамид и сквалан поддерживают увлажнённость и эластичность кожи",
     "additionalBody": "Результат: более гладкая, упругая и ухоженная кожа",
     "media": [
      {
       "src": "/images/pdp-v3/c364c7abccbd9f2002b36daf4bf81a5d1859c9df545e9a252e6b8e0b9238489e.png"
      }
     ],
     "items": []
    },
    {
     "kind": "ingredients",
     "title": "Ниацинамид, пептид, гиалуроновая кислота и сквалан",
     "body": "Ниацинамид укрепляет защитный барьер и выравнивает тон кожи, пептид помогает разгладить кожу и уменьшить выраженность мимических морщин, гиалуроновая кислота поддерживает увлажнённость и упругость, а сквалан смягчает кожу и предотвращает потерю влаги",
     "additionalBody": "Также содержит кофеин, масло ши, асаи, фукус и троксерутин — для питания, увлажнения и свежего вида кожи",
     "media": [
      {
       "src": "/images/pdp-v3/1a0cd434ddc4ff75e14c95bc2b6c7c3e58a0a0ab2e804a9f3cc83214f14a4abe.png",
       "layout": {
        "x": -4.11722,
        "y": -7.965,
        "width": 110.62867,
        "height": 138.929,
        "rotation": 0,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": []
    },
    {
     "kind": "faq",
     "title": "FAQ",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/1bda66a1214efc623f0662c92153566e84f65f9f826b4df9b03f112c5a73a47c.png"
      }
     ],
     "items": [
      {
       "title": "Подходит ли крем для сухой кожи?",
       "body": ""
      },
      {
       "title": "Подходит ли крем для комбинированной кожи?",
       "body": ""
      },
      {
       "title": "Можно ли использовать крем каждый день?",
       "body": ""
      },
      {
       "title": "Для чего в составе ниацинамид?",
       "body": ""
      },
      {
       "title": "Зачем нужен пептид?",
       "body": ""
      },
      {
       "title": "Можно ли использовать крем под макияж?",
       "body": ""
      }
     ]
    }
   ],
   "recommendations": [
    "1S-BA-02-01",
    "1S-BA-02-04",
    "1S-BA-03",
    "1S-BA-01"
   ]
  }
 },
 {
  "sku": "1S-FL-01",
  "pdp": {
   "version": 1,
   "node": "335:1878",
   "sections": [
    {
     "kind": "result",
     "title": "Мягкое увлажнение и восстановление кожи",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/cae19b28f47b131f46fc61a34b66bb278173cf5586931e1272d0461568f56bae.png",
       "layout": {
        "x": -9.37444,
        "y": -21.88,
        "width": 113.384,
        "height": 139.05482,
        "rotation": 0,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": [
      {
       "title": "",
       "body": "поддерживает естественный защитный барьер кожи"
      },
      {
       "title": "",
       "body": "уменьшает ощущение сухости и стянутости"
      },
      {
       "title": "",
       "body": "делает кожу более гладкой, мягкой и упругой"
      }
     ]
    },
    {
     "kind": "howTo",
     "title": "Как использовать",
     "body": "",
     "additionalBody": "",
     "media": [],
     "items": [
      {
       "title": "",
       "body": "Нанесите каплю геля, превращая ее в воздушную пену",
       "media": {
        "src": "/images/pdp-v3/8a3df1b72a57c8caa5c4e8d5d746277e85050b203967e8b4b93189a0cd15fe25.png"
       }
      },
      {
       "title": "",
       "body": "Мягкая ароматная пена очищает и увлажняет кожу",
       "media": {
        "src": "/images/pdp-v3/273c2adf684e671b61b661d0d478e649dd04ca418227b696a95ae209ccb8b51e.png",
        "layout": {
         "x": -12.2023,
         "y": -60.5537,
         "width": 151.40989,
         "height": 168.82741,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Смойте, ощущая гладкость и питание кожи",
       "media": {
        "src": "/images/pdp-v3/929559bcea2702fbe32242b093c6ba65a4e51d154ffcb6988e75e24e1068f286.png",
        "layout": {
         "x": 0.0,
         "y": -5.18704,
         "width": 93.79494,
         "height": 113.27889,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Наслаждайтесь свежестью и комфортом после душа",
       "media": {
        "src": "/images/pdp-v3/f2de613f621543eed9e7a6e870362a32ff9e2335123d7f0c668be04312237e7c.png",
        "layout": {
         "x": -29.67126,
         "y": -34.75741,
         "width": 159.13931,
         "height": 192.24556,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      }
     ]
    },
    {
     "kind": "lifehack",
     "title": "",
     "body": "Наносите крем на слегка влажную кожу сразу после умывания — так кожа дольше сохраняет влагу и ощущается более мягкой и наполненной",
     "additionalBody": "",
     "media": [],
     "items": []
    },
    {
     "kind": "feature",
     "title": "Почему «Восстанавливающий»?",
     "body": "Комплекс активных компонентов помогает коже восстановить комфорт, мягкость и защитный барьер. Ниацинамид, аллантоин и центелла поддерживают защитные функции кожи, а NMF-комплекс, гиалуроновая кислота и масла помогают восполнить влагу и уменьшить её потерю",
     "additionalBody": "Результат: увлажнённая, мягкая и более защищённая кожа",
     "media": [
      {
       "src": "/images/pdp-v3/e83417cf325cd879915fccb78bb144c3b1e0cbbd955a5d52197f5e94420d837d.png"
      }
     ],
     "items": []
    },
    {
     "kind": "ingredients",
     "title": "Ниацинамид, пептид, гиалуроновая кислота",
     "body": "Ниацинамид помогает укреплять защитный барьер и выравнивать тон кожи, пептид поддерживает упругость и плотность кожи, а гиалуроновая кислота и NMF-комплекс насыщают кожу влагой и помогают сохранить её",
     "additionalBody": "Также содержит: аллантоин, инулин и растительные экстракты для успокоения и восстановления кожи, а масла — для питания и смягчения",
     "media": [
      {
       "src": "/images/pdp-v3/8082e29aa8f7033c97d46f7bd95b30828c1b5b1a2dce12ac5cc06e266fef4c57.png",
       "layout": {
        "x": -4.66667,
        "y": -4.90625,
        "width": 105.75806,
        "height": 132.81238,
        "rotation": 0,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": []
    },
    {
     "kind": "faq",
     "title": "FAQ",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/1bda66a1214efc623f0662c92153566e84f65f9f826b4df9b03f112c5a73a47c.png"
      }
     ],
     "items": [
      {
       "title": "Подходит ли крем для сухой кожи?",
       "body": ""
      },
      {
       "title": "Подходит ли крем для комбинированной кожи?",
       "body": ""
      },
      {
       "title": "Можно ли использовать крем каждый день?",
       "body": ""
      },
      {
       "title": "Для чего в составе ниацинамид?",
       "body": ""
      },
      {
       "title": "Зачем нужен пептид?",
       "body": ""
      },
      {
       "title": "Можно ли использовать крем под макияж?",
       "body": ""
      }
     ]
    }
   ],
   "recommendations": [
    "1S-BA-02-01",
    "1S-BA-02-04",
    "1S-BA-03",
    "1S-BA-01"
   ]
  }
 },
 {
  "sku": "1S-HK-02",
  "pdp": {
   "version": 1,
   "node": "315:1065",
   "sections": [
    {
     "kind": "result",
     "title": "Послушные и гладкие",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/7939a7f9ef2edbfc21b6090bdcd979a13616cdd9dcaa64af8070697da657c8ab.jpg",
       "layout": {
        "x": -7.47667,
        "y": -9.19273,
        "width": 113.06644,
        "height": 138.69564,
        "rotation": 0,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": [
      {
       "title": "",
       "body": "сияющие и здоровые: глянцевый блеск"
      },
      {
       "title": "",
       "body": "устойчивые к повреждениям и внешним воздействиям"
      },
      {
       "title": "",
       "body": "наполненные влагой и упругие"
      }
     ]
    },
    {
     "kind": "howTo",
     "title": "Как использовать",
     "body": "",
     "additionalBody": "",
     "media": [],
     "items": [
      {
       "title": "",
       "body": "Встряхните флакон перед использованием",
       "media": {
        "src": "/images/pdp-v3/583a4630a526b271196b49bcfd0d06817dae4ca4eb3b61fca36ae17b133ac972.png",
        "layout": {
         "x": -16.84138,
         "y": -27.62593,
         "width": 114.85908,
         "height": 123.36722,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Распылите по длине на расстояние 15-20 см, избегая области у корней",
       "media": {
        "src": "/images/pdp-v3/7b0e1af04ba83fee2109c68bc23c9dfae75f7ba27189b9c7ccd42ff296e3dcf5.png",
        "layout": {
         "x": -51.77931,
         "y": -111.42407,
         "width": 283.99747,
         "height": 301.88963,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Расчешите для равномерного распределения",
       "media": {
        "src": "/images/pdp-v3/8010933f30df75864b287f38a0226f05dca546fc30bfe8e4fba5defecb907783.png",
        "layout": {
         "x": 0.0,
         "y": -6.19444,
         "width": 100.0,
         "height": 120.75463,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Не смывая, приступите к укладке обычным или «кудрявым» методом",
       "media": {
        "src": "/images/pdp-v3/2fd9c11df02125c305a89a826be61bc60510abfce7c0408d2dd0481e9ce29008.png",
        "layout": {
         "x": -3.96322,
         "y": -21.60926,
         "width": 107.92552,
         "height": 116.0,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      }
     ]
    },
    {
     "kind": "lifehack",
     "title": "",
     "body": "Освежите укладку: пару пшиков спрея и равномерное прочёсывание — причёска как новая",
     "additionalBody": "",
     "media": [],
     "items": []
    },
    {
     "kind": "fragrance",
     "title": "",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/19064fc57b609934af55a6ca8cfeb163cb4cc02b9e00a5a11b47952fa0c8cfb2.png"
      }
     ],
     "items": [
      {
       "title": "Верхние ноты",
       "body": "сочный спелый персик, хрустящая карамель"
      },
      {
       "title": "Ноты сердца",
       "body": "ванильный крем, цветочные аккорды жасмина"
      },
      {
       "title": "Базовые данные",
       "body": "мускус, древесные нотки, пралине"
      }
     ]
    },
    {
     "kind": "ingredients",
     "title": "Кератин, аминокислотный комплекс, термозащитные и разглаживающие компоненты",
     "body": "Кератин помогает сделать волосы более плотными и гладкими, аминокислоты поддерживают увлажнённость и эластичность, а разглаживающие компоненты уменьшают пушение и облегчают укладку",
     "additionalBody": "Также содержит экстракт персика и термозащитные компоненты",
     "media": [],
     "items": []
    },
    {
     "kind": "faq",
     "title": "FAQ",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/02d78658a05321b7076ebab12af489b9d11ef7e746c31d000fa8517adf98c9bb.png"
      }
     ],
     "items": [
      {
       "title": "На сколько применений хватит спрея?",
       "body": ""
      },
      {
       "title": "Подходит ли для ежедневного использования?",
       "body": ""
      },
      {
       "title": "Совместим ли с другими продуктами?",
       "body": ""
      },
      {
       "title": "Заменяет ли кондиционер?",
       "body": ""
      }
     ]
    }
   ],
   "recommendations": [
    "1S-BA-02-01",
    "1S-BA-02-04",
    "1S-BA-03",
    "1S-BA-01"
   ]
  }
 },
 {
  "sku": "1S-HK-03",
  "pdp": {
   "version": 1,
   "node": "354:1485",
   "sections": [
    {
     "kind": "result",
     "title": "С каждым днем волосы сильнее",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/98a7b1beb009e1460311ff6899bffaac2c6035b542f6d389e84a2083b46e6ded.jpg",
       "layout": {
        "x": -13.30889,
        "y": 0.0,
        "width": 113.30856,
        "height": 138.99273,
        "rotation": 0,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": [
      {
       "title": "",
       "body": "интенсивное увлажнение по всей длине"
      },
      {
       "title": "",
       "body": "зеркальный глянец и глубина цвета"
      },
      {
       "title": "",
       "body": "лёгкая укладка и идеальная гладкость"
      }
     ]
    },
    {
     "kind": "howTo",
     "title": "Как использовать",
     "body": "",
     "additionalBody": "",
     "media": [],
     "items": [
      {
       "title": "",
       "body": "Нанеси на чистые влажные волосы по длине, избегая зоны у корней",
       "media": {
        "src": "/images/pdp-v3/91789efae7db7aa940e007bfe01d038c87a84f4dafebc1bdd9416d2344b3ab3b.png",
        "layout": {
         "x": 6.88736,
         "y": -9.03519,
         "width": 93.78736,
         "height": 94.4063,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Равномерно распредели по длине уделив внимание кончикам",
       "media": {
        "src": "/images/pdp-v3/d2d6496b5baf1e8377d9d4cf99951e9df9c1b806595daa290219d52deb648280.png",
        "layout": {
         "x": 0.0,
         "y": -71.60741,
         "width": 151.21494,
         "height": 182.62889,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Оставь на 1–2 минуты (не требует долгого выдерживания!)",
       "media": {
        "src": "/images/pdp-v3/8010933f30df75864b287f38a0226f05dca546fc30bfe8e4fba5defecb907783.png",
        "layout": {
         "x": 0.0,
         "y": -6.19444,
         "width": 100.0,
         "height": 120.75463,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Тщательно смой прохладной водой для запечатывания кутикулы",
       "media": {
        "src": "/images/pdp-v3/2f2731a896710d8cf69c19db3fe1da57043445e67b8ea63fc4e5a221856dc73c.png",
        "layout": {
         "x": -107.89655,
         "y": -110.1537,
         "width": 241.26437,
         "height": 291.38556,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      }
     ]
    },
    {
     "kind": "lifehack",
     "title": "",
     "body": "Расчеши волосы гребнем с редкими и широкими зубьями после нанесения бальзама, чтобы равномерно распределить бальзам по длине и облегчить расчесывание после высыхания",
     "additionalBody": "",
     "media": [],
     "items": []
    },
    {
     "kind": "fragrance",
     "title": "",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/338b93de4c90e4eab4182042c7ab822b20d202703cce5c2dfbdb951f790cfde8.png"
      }
     ],
     "items": [
      {
       "title": "Верхние ноты",
       "body": "марин, черная смородина, груша, розовый перец"
      },
      {
       "title": "Ноты сердца",
       "body": "жасмин, апельсиновый цвет, роза, фиалка"
      },
      {
       "title": "Базовые данные",
       "body": "ваниль, пачули, белый кедр, мускус"
      }
     ]
    },
    {
     "kind": "ingredients",
     "title": "Кератин, кокосовое масло, глицерин и растительные экстракты",
     "body": "Кератин помогает сделать волосы более гладкими, плотными и визуально ухоженными. Кокосовое масло питает и смягчает волосы, а глицерин удерживает влагу и помогает поддерживать их мягкость и эластичность",
     "additionalBody": "Также содержит экстракты асаи, малины и розмарина — для дополнительного ухода, гладкости и естественного блеска волос",
     "media": [
      {
       "src": "/images/pdp-v3/3bf192444b660d7728d296a5e0e96db6561dc2fe98d6ec313f72dbd365c3f07d.jpg",
       "layout": {
        "x": 12.39556,
        "y": -103.0625,
        "width": 143.82317,
        "height": 371.12613,
        "rotation": -166.6,
        "flipX": false,
        "flipY": true
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": []
    },
    {
     "kind": "faq",
     "title": "FAQ",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/e992de30b7eeca181787cdb40d68cd0249fbd6d5f45a62a234b7c98aef143a8b.png"
      }
     ],
     "items": [
      {
       "title": "Подходит ли бальзам для всех типов волос?",
       "body": ""
      },
      {
       "title": "Можно ли наносить бальзам на корни?",
       "body": ""
      },
      {
       "title": "Как часто можно использовать бальзам?",
       "body": ""
      },
      {
       "title": "Сколько держать бальзам на волосах?",
       "body": ""
      },
      {
       "title": "Утяжеляет ли волосы бальзам?",
       "body": ""
      },
      {
       "title": "Нужно ли использовать бальзам, если я использую маску для волос?",
       "body": ""
      },
      {
       "title": "Чем бальзам отличается от маски?",
       "body": ""
      },
      {
       "title": "Можно ли использовать бальзам каждый день?",
       "body": ""
      }
     ]
    }
   ],
   "recommendations": [
    "1S-BA-02-01",
    "1S-BA-02-04",
    "1S-BA-03",
    "1S-BA-01"
   ]
  }
 },
 {
  "sku": "1S-HK-01",
  "pdp": {
   "version": 1,
   "node": "360:1710",
   "sections": [
    {
     "kind": "result",
     "title": "Мягкое, но эффективное очищение",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/aa83c8dde9870363962b54618527bee91e9dedd1e9be7f48d06571e750ed2b76.jpg",
       "layout": {
        "x": -31.35,
        "y": -17.93636,
        "width": 146.48511,
        "height": 179.68945,
        "rotation": 0,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": [
      {
       "title": "",
       "body": "напитанные и увлажненные"
      },
      {
       "title": "",
       "body": "гладкие и упругие"
      },
      {
       "title": "",
       "body": "стойкий цвет дольше на 2-3 недели"
      },
      {
       "title": "",
       "body": "послушные и сияющие"
      }
     ]
    },
    {
     "kind": "howTo",
     "title": "Как использовать",
     "body": "",
     "additionalBody": "",
     "media": [],
     "items": [
      {
       "title": "",
       "body": "Нанеси шампунь на корни волос",
       "media": {
        "src": "/images/pdp-v3/b8128e1f8e78c04378b511e39b69665f300169cca1b12ab9e935a8ae117dd6f0.png",
        "layout": {
         "x": 4.75172,
         "y": -7.20185,
         "width": 95.24736,
         "height": 94.68778,
         "rotation": -1.64,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Промассируй подушечками пальцев 1-2 минуты",
       "media": {
        "src": "/images/pdp-v3/a515bf40a1da74b6ef124507861b44a728e258d320c272786fda44c8e619b277.png",
        "layout": {
         "x": -22.5931,
         "y": -68.85556,
         "width": 145.18575,
         "height": 154.22648,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Тщательно смой шампунь водой",
       "media": {
        "src": "/images/pdp-v3/8010933f30df75864b287f38a0226f05dca546fc30bfe8e4fba5defecb907783.png",
        "layout": {
         "x": 0.0,
         "y": -6.19444,
         "width": 100.0,
         "height": 120.75463,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Приступите к дальнейшему уходу"
      }
     ]
    },
    {
     "kind": "lifehack",
     "title": "",
     "body": "Смывайте теплой или прохладной водой, чтобы уменьшить жирность и добавить блеска",
     "additionalBody": "",
     "media": [],
     "items": []
    },
    {
     "kind": "fragrance",
     "title": "",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/338b93de4c90e4eab4182042c7ab822b20d202703cce5c2dfbdb951f790cfde8.png"
      }
     ],
     "items": [
      {
       "title": "Верхние ноты",
       "body": "марин, черная смородина, груша, розовый перец"
      },
      {
       "title": "Ноты сердца",
       "body": "жасмин, апельсиновый цвет, роза, фиалка"
      },
      {
       "title": "Базовые данные",
       "body": "ваниль, пачули, белый кедр, мускус"
      }
     ]
    },
    {
     "kind": "ingredients",
     "title": "Кератин, глицерин, кондиционирующий комплекс и растительные экстракты",
     "body": "Кератин помогает сделать волосы более гладкими, плотными и визуально ухоженными. Глицерин удерживает влагу и помогает сохранить мягкость волос после очищения, а кондиционирующий компонент Polyquaternium-7 облегчает расчёсывание и уменьшает спутывание",
     "additionalBody": "Также содержит экстракты асаи и манго — для дополнительного ухода, мягкости и естественного сияния волос",
     "media": [
      {
       "src": "/images/pdp-v3/3bf192444b660d7728d296a5e0e96db6561dc2fe98d6ec313f72dbd365c3f07d.jpg",
       "layout": {
        "x": 3.04611,
        "y": -107.76875,
        "width": 156.32083,
        "height": 378.53812,
        "rotation": 26.72,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": []
    },
    {
     "kind": "faq",
     "title": "FAQ",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/207d6aed904dd52e48f9855b144f7d3d528fdadda3ba6b4808566bf5e9eb0c79.png"
      }
     ],
     "items": [
      {
       "title": "Подходит ли шампунь для всех типов волос?",
       "body": ""
      },
      {
       "title": "Подходит ли шампунь для сухих волос?",
       "body": ""
      },
      {
       "title": "Подходит ли шампунь для окрашенных волос?",
       "body": ""
      },
      {
       "title": "Можно ли использовать шампунь каждый день?",
       "body": ""
      },
      {
       "title": "Нужно ли использовать бальзам после шампуня?",
       "body": ""
      },
      {
       "title": "Можно ли использовать шампунь вместе с маской?",
       "body": ""
      },
      {
       "title": "Есть ли в шампуне кератин?",
       "body": ""
      },
      {
       "title": "Можно ли использовать шампунь для вьющихся волос?",
       "body": ""
      }
     ]
    }
   ],
   "recommendations": [
    "1S-BA-02-01",
    "1S-BA-02-04",
    "1S-BA-03",
    "1S-BA-01"
   ]
  }
 },
 {
  "sku": "1S-HK-05",
  "pdp": {
   "version": 1,
   "node": "368:1627",
   "sections": [
    {
     "kind": "result",
     "title": "Мгновенное сияние",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/ded1fc63a6f37abdd0a11319312d964d9bdd7499157e6a530bd45f862095c03d.png",
       "layout": {
        "x": -37.13111,
        "y": -7.48727,
        "width": 162.28656,
        "height": 199.07273,
        "rotation": 0,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": [
      {
       "title": "",
       "body": "реконструирует разрушенную структуру"
      },
      {
       "title": "",
       "body": "возвращает прядям настоящий здоровый блеск"
      },
      {
       "title": "",
       "body": "облегчает расчёсывание в 3 раза"
      }
     ]
    },
    {
     "kind": "howTo",
     "title": "Как использовать",
     "body": "",
     "additionalBody": "",
     "media": [],
     "items": [
      {
       "title": "",
       "body": "Нанесите на чистые влажные волосы",
       "media": {
        "src": "/images/pdp-v3/7565533b85afa0cdfc3b268a4ac3e62f53e0f42d3016737ff502ad5899503126.png",
        "layout": {
         "x": 7.15862,
         "y": -8.76296,
         "width": 93.51609,
         "height": 94.13315,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Равномерно распределите по длине",
       "media": {
        "src": "/images/pdp-v3/3884cfd3cc628ad0d16bd370fc17440e011bdfa10f1f11e8527f253ef8da39d8.png",
        "layout": {
         "x": -29.16322,
         "y": -82.81111,
         "width": 153.73241,
         "height": 182.99167,
         "rotation": -1.02,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Нанесите от середины до кончиков, избегая корней",
       "media": {
        "src": "/images/pdp-v3/8010933f30df75864b287f38a0226f05dca546fc30bfe8e4fba5defecb907783.png",
        "layout": {
         "x": 0.0,
         "y": -6.19444,
         "width": 100.0,
         "height": 120.75463,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Оставьте на 5-7 минут, после тщательно смойте",
       "media": {
        "src": "/images/pdp-v3/2897033f18d9b9570e8b7dbdcd6d1a17ba35f57721939d6ae4659cee01ff42e3.png",
        "layout": {
         "x": -20.75862,
         "y": -7.95185,
         "width": 117.06759,
         "height": 117.3013,
         "rotation": -5.04,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": -23.16,
         "width": 141.57,
         "height": 123.16
        }
       }
      }
     ]
    },
    {
     "kind": "lifehack",
     "title": "",
     "body": "После маски используйте бальзам ASAYA. Он закрепит результат, сохранит полезные вещества внутри волоса и подарит им гладкость",
     "additionalBody": "",
     "media": [],
     "items": []
    },
    {
     "kind": "fragrance",
     "title": "",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/338b93de4c90e4eab4182042c7ab822b20d202703cce5c2dfbdb951f790cfde8.png"
      }
     ],
     "items": [
      {
       "title": "Верхние ноты",
       "body": "марин, черная смородина, груша, розовый перец"
      },
      {
       "title": "Ноты сердца",
       "body": "жасмин, апельсиновый цвет, роза, фиалка"
      },
      {
       "title": "Базовые данные",
       "body": "ваниль, пачули, белый кедр, мускус"
      }
     ]
    },
    {
     "kind": "ingredients",
     "title": "Кератин, аминокислотный комплекс и разглаживающий компонент",
     "body": "Кератин помогает сделать волосы более плотными, гладкими и визуально восстановленными. Аминокислоты поддерживают увлажнённость и эластичность волос, а разглаживающий компонент уменьшает пушение, облегчает расчёсывание и придаёт волосам блеск",
     "additionalBody": "Также содержит экстракт черники — источник антиоксидантов, который дополняет уход и помогает сохранить здоровый и сияющий вид волос",
     "media": [
      {
       "src": "/images/pdp-v3/9951a3cc7ef908e5f833aa1aea98ebf627e6286016fb5a6edc4ad59c04c579ba.png",
       "layout": {
        "x": 25.85556,
        "y": -84.9425,
        "width": 82.26944,
        "height": 315.88538,
        "rotation": -3.25,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": []
    },
    {
     "kind": "faq",
     "title": "FAQ",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/ab19101bbf84ccf6900ecb81c4e4ba69b5d9c8c81338073d0a916cb740adb3a6.png"
      }
     ],
     "items": [
      {
       "title": "Для какого типа волос подходит маска?",
       "body": ""
      },
      {
       "title": "Как часто использовать маску?",
       "body": ""
      },
      {
       "title": "Можно ли использовать маску после каждого мытья?",
       "body": ""
      },
      {
       "title": "Сколько держать маску на волосах?",
       "body": ""
      },
      {
       "title": "Утяжеляет ли волосы маска?",
       "body": ""
      },
      {
       "title": "Можно ли наносить маску на вьющиеся волосы?",
       "body": ""
      },
      {
       "title": "Чем маска отличается от бальзама?",
       "body": ""
      },
      {
       "title": "Можно ли использовать маску вместе с бальзамом?",
       "body": ""
      }
     ]
    }
   ],
   "recommendations": [
    "1S-BA-02-01",
    "1S-BA-02-04",
    "1S-BA-03",
    "1S-BA-01"
   ]
  }
 },
 {
  "sku": "1S-HK-04",
  "pdp": {
   "version": 1,
   "node": "383:2020",
   "sections": [
    {
     "kind": "result",
     "title": "Верните волосам силу и красоту",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/461b29cf6828c47728ea8cb211072cdda8394a7bae1f3c940d8198ec99f9aa49.png",
       "layout": {
        "x": -105.09222,
        "y": -46.14455,
        "width": 303.55556,
        "height": 372.36364,
        "rotation": 0,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": [
      {
       "title": "",
       "body": "интенсивное увлажнение и шёлковая мягкость"
      },
      {
       "title": "",
       "body": "глянцевая сглаженная кутикула"
      },
      {
       "title": "",
       "body": "лёгкая укладка, комфорт при расчёсывании"
      }
     ]
    },
    {
     "kind": "howTo",
     "title": "Как использовать",
     "body": "",
     "additionalBody": "",
     "media": [],
     "items": [
      {
       "title": "",
       "body": "Встряхните флакон перед использованием",
       "media": {
        "src": "/images/pdp-v3/72021cecad203d453965dfd44a830323a45225e722de8224dcbb038a970b5328.png",
        "layout": {
         "x": -9.64368,
         "y": -23.31296,
         "width": 107.19609,
         "height": 115.16407,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      },
      {
       "title": "",
       "body": "Распылите на чистые и подсушенные полотенцем волосы, на расстоянии 15-20 см"
      },
      {
       "title": "",
       "body": "Расчешите для равномерного распределения"
      },
      {
       "title": "",
       "body": "Не смывая, приступите к укладке обычным или «кудрявым» методом",
       "media": {
        "src": "/images/pdp-v3/e6d8b918ed4b90bbc378212bd129068626928edaee900d6d300e43f645b9d1a1.png",
        "layout": {
         "x": -0.28276,
         "y": -11.4537,
         "width": 101.33609,
         "height": 102.01,
         "rotation": 0,
         "flipX": false,
         "flipY": false
        },
        "frame": {
         "x": 0,
         "y": 0,
         "width": 100,
         "height": 100
        }
       }
      }
     ]
    },
    {
     "kind": "lifehack",
     "title": "",
     "body": "После укладки нанесите 1–2 распыления на ладони, разотрите и слегка пройдитесь по длине и кончикам. Это поможет пригладить пушение и добавить ухоженный вид",
     "additionalBody": "",
     "media": [],
     "items": []
    },
    {
     "kind": "fragrance",
     "title": "",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/33ba0fa317d7e47ab26f2bdefbd81359a6092513c61e7b787a1109731288be89.png"
      }
     ],
     "items": [
      {
       "title": "Верхние ноты",
       "body": "сочная вишня, прохладная мята"
      },
      {
       "title": "Ноты сердца",
       "body": "нежный жасмин, таинственный ирис"
      },
      {
       "title": "Базовые данные",
       "body": "глубокий сандал, тёплый мускус"
      }
     ]
    },
    {
     "kind": "ingredients",
     "title": "Кератин, аминокислотный комплекс, разглаживающие и кондиционирующие компоненты",
     "body": "Кератин помогает сделать волосы более плотными, гладкими и визуально восстановленными. Аминокислотный комплекс поддерживает увлажнённость и эластичность волос, делая их мягкими и более живыми. Разглаживающие компоненты уменьшают пушение, облегчают расчёсываниея и помогают сохранить аккуратный вид волос",
     "additionalBody": "Также содержит экстракт вишни — для мягкости и естественного сияния волос",
     "media": [
      {
       "src": "/images/pdp-v3/77312dce39cb08a5287b7ece95b0656185b09c53879d7ade2e27a083edec9794.png",
       "layout": {
        "x": 3.04611,
        "y": -67.3425,
        "width": 129.86589,
        "height": 359.32488,
        "rotation": 0,
        "flipX": false,
        "flipY": false
       },
       "frame": {
        "x": 0,
        "y": 0,
        "width": 100,
        "height": 100
       }
      }
     ],
     "items": []
    },
    {
     "kind": "faq",
     "title": "FAQ",
     "body": "",
     "additionalBody": "",
     "media": [
      {
       "src": "/images/pdp-v3/4ba797cdb35e7c7098b6f63006e66f4ef626cf78fdae8f76f641766cdb0ee99b.png"
      }
     ],
     "items": [
      {
       "title": "Можно ли использовать крем спрей каждый день?",
       "body": ""
      },
      {
       "title": "Подходит ли крем спрей для кудрявых волос?",
       "body": ""
      },
      {
       "title": "Нужно ли смывать спрей-маску?",
       "body": ""
      },
      {
       "title": "Можно ли наносить на сухие волосы?",
       "body": ""
      },
      {
       "title": "Можно ли использовать крем спрей перед укладкой?",
       "body": ""
      },
      {
       "title": "Не утяжелит ли крем спрей тонкие волосы?",
       "body": ""
      },
      {
       "title": "Можно ли использовать крем спрей по кудрявому методу?",
       "body": ""
      }
     ]
    }
   ],
   "recommendations": [
    "1S-BA-02-01",
    "1S-BA-02-04",
    "1S-BA-03",
    "1S-BA-01"
   ]
  }
 }
]
$pdp$::jsonb)
)
UPDATE product_editor e SET
 draft=CASE WHEN e.draft->'content' ? 'pdp' THEN e.draft ELSE jsonb_set(e.draft,'{content,pdp}',t.pdp) END,
 published=CASE WHEN e.published IS NULL OR e.published->'content' ? 'pdp' THEN e.published ELSE jsonb_set(e.published,'{content,pdp}',t.pdp) END,
 revision=e.revision+1,updated_at=now()
FROM products p JOIN templates t ON t.sku=p.sku
WHERE e.product_id=p.id AND (
 NOT (e.draft->'content' ? 'pdp') OR (e.published IS NOT NULL AND NOT (e.published->'content' ? 'pdp'))
);
