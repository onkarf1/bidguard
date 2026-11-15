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
  }
];

export const creditLine = (s: SampleItem) => `Photo: ${s.credit.author}, ${s.credit.license}, via Wikimedia Commons`;
