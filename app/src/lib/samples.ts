/**
 * Demo items with real, freely licensed photos from Wikimedia Commons (credits below and in
 * public/samples/CREDITS.md). Used by "Try a sample item" on /sell and by `yarn seed`.
 */
export type SampleItem = { slug: string; image: string; title: string; category: string; condition: "new" | "like new" | "good" | "fair" | "for parts"; price: number; description: string; credit: { author: string; license: string; source: string } };

export const SAMPLES: SampleItem[] = [
  {
    "slug": "air-jordan-1",
    "image": "/samples/air-jordan-1.jpg",
    "title": "Nike Air Jordan 1 retro sneakers",
    "category": "Sneakers",
    "condition": "good",
    "price": 85,
    "description": "Classic Air Jordan 1 high-tops in red, white and black. Worn a handful of times, soles in great shape, original laces. Size 10 US.",
    "credit": {
      "author": "Osyffar",
      "license": "CC0",
      "source": "https://commons.wikimedia.org/wiki/File:Nike_Air_Jordan_I.jpg"
    }
  },
  {
    "slug": "canon-ae1",
    "image": "/samples/canon-ae1.jpg",
    "title": "Canon AE-1 35mm film camera with 50mm lens",
    "category": "Electronics",
    "condition": "good",
    "price": 120,
    "description": "Canon AE-1 SLR with a Canon FD 50mm lens. Shutter fires at all speeds, light meter works with a fresh battery. Light wear on the top plate.",
    "credit": {
      "author": "RRT877",
      "license": "CC0",
      "source": "https://commons.wikimedia.org/wiki/File:Wikicommons_canon_ae-1_rrt877.jpg"
    }
  },
  {
    "slug": "game-boy",
    "image": "/samples/game-boy.jpg",
    "title": "Original Nintendo Game Boy (DMG-01)",
    "category": "Gaming",
    "condition": "fair",
    "price": 45,
    "description": "Original grey Game Boy. Screen has no dead lines, sound works, buttons responsive. Battery cover included. Some scuffs on the back.",
    "credit": {
      "author": "Evan-Amos",
      "license": "Public domain",
      "source": "https://commons.wikimedia.org/wiki/File:Game-Boy-Original.jpg"
    }
  },
  {
    "slug": "polaroid-sx70",
    "image": "/samples/polaroid-sx70.jpg",
    "title": "Polaroid SX-70 folding instant camera",
    "category": "Electronics",
    "condition": "good",
    "price": 140,
    "description": "Folding SX-70 Land Camera. Bellows are light-tight and the mechanism ejects cleanly. Works with SX-70 film. Leather is in good shape.",
    "credit": {
      "author": "Michael Gatchell",
      "license": "CC BY 2.0",
      "source": "https://commons.wikimedia.org/wiki/File:Polaroid_SX-70_camera.jpg"
    }
  },
  {
    "slug": "mech-keyboard",
    "image": "/samples/mech-keyboard.jpg",
    "title": "Mechanical keyboard with RGB backlight",
    "category": "Electronics",
    "condition": "like new",
    "price": 55,
    "description": "Full-size mechanical keyboard, tactile switches, RGB backlight, detachable USB cable. Used for a month, every key works.",
    "credit": {
      "author": "SolarMainframe",
      "license": "CC BY-SA 4.0",
      "source": "https://commons.wikimedia.org/wiki/File:Mechanical_Keyboard.jpg"
    }
  },
  {
    "slug": "seiko-5",
    "image": "/samples/seiko-5.jpg",
    "title": "Vintage Seiko 5 automatic wristwatch",
    "category": "Fashion",
    "condition": "good",
    "price": 90,
    "description": "Vintage Seiko 5 automatic with day-date. Keeps good time, crystal has light marks, original bracelet. Serviced two years ago.",
    "credit": {
      "author": "Kanderstegen",
      "license": "CC BY 3.0",
      "source": "https://commons.wikimedia.org/wiki/File:Vintage_Seiko_5_wristwatch.jpg"
    }
  },
  {
    "slug": "stratocaster",
    "image": "/samples/stratocaster.jpg",
    "title": "Fender Stratocaster electric guitar",
    "category": "Collectibles",
    "condition": "good",
    "price": 420,
    "description": "Fender Stratocaster in sunburst. Plays well, neck is straight, all pickups and switches work. A few dings on the body from regular play.",
    "credit": {
      "author": "Stra2caster (derivative work: At)",
      "license": "Public domain",
      "source": "https://commons.wikimedia.org/wiki/File:Fender_Stratocaster_004-2.jpg"
    }
  },
  {
    "slug": "gba-blue",
    "image": "/samples/gba-blue.jpg",
    "title": "Game Boy Advance, milky blue",
    "category": "Gaming",
    "condition": "like new",
    "price": 70,
    "description": "Milky blue Game Boy Advance in excellent condition. Clean screen lens, all buttons work, battery cover present.",
    "credit": {
      "author": "Evan-Amos",
      "license": "Public domain",
      "source": "https://commons.wikimedia.org/wiki/File:Nintendo-Game-Boy-Advance-Milky-Blue-FL.jpg"
    }
  },
  {
    "slug": "record-player",
    "image": "/samples/record-player.jpg",
    "title": "Retro record player with cassette and radio",
    "category": "Home",
    "condition": "good",
    "price": 65,
    "description": "All-in-one retro record player with turntable, cassette deck and radio. Plays 33 and 45 rpm. Built-in speakers sound clear.",
    "credit": {
      "author": "Amitbalani",
      "license": "CC0",
      "source": "https://commons.wikimedia.org/wiki/File:Record_Player_with_Cassette_%26_Radio_functionality.jpg"
    }
  },
  {
    "slug": "lego-6842",
    "image": "/samples/lego-6842.jpg",
    "title": "LEGO Space 6842 Shuttle Craft (vintage)",
    "category": "Collectibles",
    "condition": "good",
    "price": 60,
    "description": "Vintage LEGO Classic Space set 6842 Shuttle Craft. Complete with minifigure, assembled, no instructions.",
    "credit": {
      "author": "InSapphoWeTrust from Los Angeles, California, USA",
      "license": "CC BY-SA 2.0",
      "source": "https://commons.wikimedia.org/wiki/File:Lego_Space_-_Set_6842_Shuttle_Craft_(7539329454).jpg"
    }
  },
  {
    "slug": "ipod-classic",
    "image": "/samples/ipod-classic.jpg",
    "title": "iPod classic 80GB, silver",
    "category": "Electronics",
    "condition": "good",
    "price": 75,
    "description": "6th-gen iPod classic, 80GB. Battery holds a charge for a full day, click wheel works perfectly, a few light scratches on the back.",
    "credit": {
      "author": "Raimond Spekking",
      "license": "CC BY-SA 4.0",
      "source": "https://commons.wikimedia.org/wiki/File:IPod_classic_80_GB_(A1238,_YMV)-9876.jpg"
    }
  },
  {
    "slug": "walkman",
    "image": "/samples/walkman.jpg",
    "title": "Original 1979 Sony Walkman TPS-L2",
    "category": "Electronics",
    "condition": "good",
    "price": 160,
    "description": "The original blue-and-silver Sony Walkman TPS-L2 from 1979. Plays tapes, both headphone jacks work, belt replaced last year.",
    "credit": {
      "author": "Anna Gerdén",
      "license": "CC BY-SA 3.0",
      "source": "https://commons.wikimedia.org/wiki/File:Walkman_TPS-L2.jpg"
    }
  },
  {
    "slug": "rubiks-cube",
    "image": "/samples/rubiks-cube.jpg",
    "title": "Classic Rubik's Cube 3x3",
    "category": "Collectibles",
    "condition": "like new",
    "price": 12,
    "description": "Classic 3x3 Rubik's Cube, turns smoothly, stickers in great shape. Solved and ready to scramble.",
    "credit": {
      "author": "Lars Karlsson (Keqs)",
      "license": "CC BY-SA 3.0",
      "source": "https://commons.wikimedia.org/wiki/File:Rubiks_cube_by_keqs.jpg"
    }
  },
  {
    "slug": "typewriter",
    "image": "/samples/typewriter.jpg",
    "title": "Olympia Splendid 33 typewriter (1961)",
    "category": "Home",
    "condition": "good",
    "price": 95,
    "description": "1961 Olympia Splendid 33 portable typewriter. All keys strike, carriage returns smoothly, new ribbon installed. Comes with case.",
    "credit": {
      "author": "Al*from*Lig",
      "license": "CC BY-SA 4.0",
      "source": "https://commons.wikimedia.org/wiki/File:Olympia_%22Splendid_33%22_-_1961.jpg"
    }
  },
  {
    "slug": "leica-m3",
    "image": "/samples/leica-m3.jpg",
    "title": "Leica M3 rangefinder camera",
    "category": "Electronics",
    "condition": "good",
    "price": 1200,
    "description": "Leica M3 35mm rangefinder body. Bright viewfinder, shutter accurate at all speeds, light brassing on the edges. Body only.",
    "credit": {
      "author": "Rama",
      "license": "CC BY-SA 2.0 fr",
      "source": "https://commons.wikimedia.org/wiki/File:Leica_M3_mg_3628.jpg"
    }
  },
  {
    "slug": "yamaha-guitar",
    "image": "/samples/yamaha-guitar.jpg",
    "title": "Yamaha FG-331 acoustic guitar",
    "category": "Collectibles",
    "condition": "good",
    "price": 140,
    "description": "Yamaha FG-331 dreadnought acoustic. Warm tone, straight neck, comfortable action. Some pick wear below the sound hole.",
    "credit": {
      "author": "Veradrive",
      "license": "CC0",
      "source": "https://commons.wikimedia.org/wiki/File:Yamaha_Acoustic_Guitar_FG-331v2.jpg"
    }
  },
  {
    "slug": "n64",
    "image": "/samples/n64.jpg",
    "title": "Nintendo 64 console",
    "category": "Gaming",
    "condition": "good",
    "price": 90,
    "description": "Nintendo 64 console with expansion pak. Tested and working, video output is clean. Light yellowing on the shell.",
    "credit": {
      "author": "Larry D. Moore",
      "license": "CC BY 4.0",
      "source": "https://commons.wikimedia.org/wiki/File:Nintendo_64.jpg"
    }
  },
  {
    "slug": "rayban",
    "image": "/samples/rayban.jpg",
    "title": "Ray-Ban sunglasses",
    "category": "Fashion",
    "condition": "like new",
    "price": 70,
    "description": "Ray-Ban sunglasses, black frame. Lenses scratch-free, hinges tight. Comes with the case.",
    "credit": {
      "author": "Jacek Halicki",
      "license": "CC BY-SA 4.0",
      "source": "https://commons.wikimedia.org/wiki/File:2023_Okulary_przeciws%C5%82oneczne_Ray-Ban_(1).jpg"
    }
  },
  {
    "slug": "casio-f91w",
    "image": "/samples/casio-f91w.jpg",
    "title": "Casio F-91W digital watch",
    "category": "Fashion",
    "condition": "new",
    "price": 15,
    "description": "Classic Casio F-91W digital watch. New, with alarm, stopwatch and backlight. Battery included.",
    "credit": {
      "author": "Multicherry",
      "license": "CC BY-SA 4.0",
      "source": "https://commons.wikimedia.org/wiki/File:Casio_F-91W_watch_(2023)_(front_closeup_-_time)_(minor_retouch).jpg"
    }
  },
  {
    "slug": "skateboard",
    "image": "/samples/skateboard.jpg",
    "title": "Vintage 60s Nash wooden skateboard",
    "category": "Collectibles",
    "condition": "fair",
    "price": 55,
    "description": "Vintage 1960s Nash Shark wooden deck skateboard with original metal wheels. Display piece; deck has age wear.",
    "credit": {
      "author": "H. Michael Karshis",
      "license": "CC BY 2.0",
      "source": "https://commons.wikimedia.org/wiki/File:Nash_Vintage_60%27s_Wooden_Deck_Shark_Skateboard.jpg"
    }
  }

];

export const creditLine = (s: SampleItem) => `Photo: ${s.credit.author}, ${s.credit.license}, via Wikimedia Commons`;
