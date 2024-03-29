const COLORS = {
    black: '#000000',
    red: '#EA6C6D',
    green: '#86B300',
    yellow: '#ECA944',
    blue: '#3199E1',
    purple: '#A37ACC',
    cyan: '#4CBF99',
    grey: '#C7C7C7',
};

function draw_process_bar(x, y, percent, bar_color, msg) {
    const length = 400;
    ctx.fillStyle = COLORS.grey + '60';
    ctx.fillRect(x, y, length, 20);
    ctx.fillStyle = bar_color + '60';

    const bar_length = length * percent / 100;
    const message = msg || Math.round(percent).toString() + '%';

    ctx.fillRect(x, y, bar_length, 20);
    ctx.fillStyle = COLORS.black;
    ctx.fillText(message, x + bar_length + 2, y + 13);
}

function to_trio_str(x) {
    if (x < 10) { return "&nbsp;&nbsp;" + x.toString(); }
    if (x < 100) { return "&nbsp;" + x.toString(); }
    return x.toString();
}

function KeyboardState() {
    function _Listener(code, callback) {
        this.check = (x) => x.code == code;
        this.eval = callback;
    }

    this.keydown_listeners = new Array();
    this.keyup_listeners = new Array();
    this.state = new Map();

    this.request_keydown = (x, callback) => {
        this.keydown_listeners.push(new _Listener(x, callback));
    };

    this.request_keyup = (x, callback) => {
        this.keyup_listeners.push(new _Listener(x, callback));
    };

    this.get = (x) => {
        return this.state.get(x);
    };

    let that = this;
    window.addEventListener('keydown', function (x) {
        if (!that.get(x.code)) {
            for (let i in that.keydown_listeners) {
                let e = that.keydown_listeners[i];
                if (e.check(x)) {
                    e.eval();
                }
            }
        }
        that.state.set(x.code, true);
    });

    window.addEventListener('keyup', function (x) {
        for (let i in that.keyup_listeners) {
            let e = that.keyup_listeners[i];
            if (e.check(x)) {
                e.eval();
            }
        }
        that.state.set(x.code, false);
    });
}

function complete_with_default(a, v) {
    for (let i in v) {
        if (a[i] === undefined || a[i] === null) {
            a[i] = v[i];
        }
    }
    return a;
}

const ph = 20, pw = 5;
const board_width = 1500, board_height = 800;
const common_spd = .4;
const max = Math.max;
const min = Math.min;

let ctx;
let kbd_state = new KeyboardState();
let playerA;
let playerB;
let lands = new LandScape();
lands.make();

let crates = new MultiAliveManager();
let lst_clock = 0;
let clock = 0;

function random_positive_negative() {
    if (Math.round(Math.random())) { return 1; }
    return -1;
}

function common_check_crash(a, b) {
    let dft = {
        xl: 0, yl: 0,
        xa: 0, ya: 0,
    };
    complete_with_default(a, dft);
    complete_with_default(b, dft);

    let minAx = min(a.x, a.x + a.xl, a.x + a.xa, a.x + a.xl + a.xa);
    let minBx = min(b.x, b.x + b.xl, b.x + b.xa, b.x + b.xl + b.xa);
    let minAy = min(a.y, a.y + a.yl, a.y + a.ya, a.y + a.yl + a.ya);
    let minBy = min(b.y, b.y + b.yl, b.y + b.ya, b.y + b.yl + b.ya);

    let maxAx = max(a.x, a.x + a.xl, a.x + a.xa, a.x + a.xl + a.xa);
    let maxBx = max(b.x, b.x + b.xl, b.x + b.xa, b.x + b.xl + b.xa);
    let maxAy = max(a.y, a.y + a.yl, a.y + a.ya, a.y + a.yl + a.ya);
    let maxBy = max(b.y, b.y + b.yl, b.y + b.ya, b.y + b.yl + b.ya);

    if (minAx <= maxBx && maxAx >= minBx && minAy <= maxBy && maxAy >= minBy) { return true; }
    return false;
}

function MultiAliveManager() {
    this.list = new Array();

    this.add = (e) => {
        this.list.push(e);
    };

    this.update = (callback) => {
        this.for_each(callback);
        if (this.list.length > 100) {
            let n = new Array();
            this.for_each((e) => { n.push(e); })
            this.list = n;
        }
    };

    this.for_each = (callback) => {
        for (let i in this.list) {
            let e = this.list[i];
            if (e.alive()) {
                if (callback(e) == 'break') {
                    break;
                }
            }
        }
    };
}

function Player(keys, color, dp_config) {
    this.gun = new Rifle();

    this.life = 3;
    this.space_jump = 0;
    this.blood = 100;

    this.in_abs_hit_ttl = 0;

    this.bullets = new MultiAliveManager();

    this.d = 1;

    let rland = lands.random();
    this.x = rland.x + rland.len * Math.random();
    this.y = -500;

    this.xa = 0;
    this.ya = 0;

    this.xaa = 0;
    this.yaa = 0.5 * common_spd;

    kbd_state.request_keydown(keys.key_up, () => { this.jump(); });
    kbd_state.request_keydown(keys.key_down, () => { this.down(); });
    kbd_state.request_keydown(keys.key_fire, () => {
        if (!this.gun.can_multi_fire()) { this.fire(); }
    });
    kbd_state.request_keydown(keys.key_left, () => { this.left(); });
    kbd_state.request_keydown(keys.key_right, () => { this.right(); });

    this.jump = () => {
        if (this.space_jump >= 3) { return; }
        this.ya = -25 * common_spd;
        this.space_jump += 1;
    };

    this.update = () => {
        if (!this.alive()) {
            this.blood = 100;
            rland = lands.random();
            this.x = rland.x + rland.len * Math.random();
            this.y = -500;
            this.gun = new AK47Gun();
            this.life -= 1;
            this.space_jump = 0;
            this.bullets = new MultiAliveManager();
            this.xa = 0;
            this.ya = 0;
            this.xaa = 0;
            this.yaa = 0.5 * common_spd;
            return;
        }
        this.in_abs_hit_ttl -= 1;

        if (Math.abs(this.xa) < 1e-6) { this.xaa = 0; }
        this.xa += this.xaa;
        this.ya += this.yaa;
        this.ya = min(this.ya, 10);
        this.x += this.xa;

        if (this.ya >= 0) {
            for (let l in lands.lands) {
                if (lands.at(l).check_crash(this.x, this.y, ph + this.ya)) {
                    this.y = lands.at(l).y - ph;
                    this.ya = 0;
                    this.space_jump = 0;
                    break;
                }
            }
        }
        this.y += this.ya;

        if (this.gun.update()) {
            this.gun = new Rifle();
        }

        if (this.gun.can_multi_fire() && kbd_state.get(keys.key_fire)) {
            this.fire();
        }

        if (kbd_state.get(keys.key_left)) { this.left(); }
        if (kbd_state.get(keys.key_right)) { this.right(); }

        this.bullets.update((e) => {
            e.update();
            e.draw();
        });

        this.collect_crate();
        this.draw();

        this.draw_info();
    };

    this.draw = () => {
        if (this.gun.draw) {
            this.gun.draw(this);
        }

        if (this.gun.can_fire()) { ctx.fillStyle = color; }
        else { ctx.fillStyle = COLORS.grey; }

        ctx.fillRect(this.x, this.y, pw, ph);
        ctx.fillRect(this.x + (pw - 1) * this.d, this.y, 6, 5);

        const rbi = this.gun.bullet_count();
        ctx.fillStyle = COLORS.black;
        ctx.fillText(Math.round(this.blood).toString() + ' ' + rbi.rest.toString(), this.x, this.y - 5);
    };

    this.left = () => {
        if (this.d != -1) { this.d = -1; }
        if (this.in_abs_hit_ttl > 0) { return; }
        this.xaa = 0.1;
        this.xa = -5;
        this.d = -1;
    };

    this.right = () => {
        if (this.d != 1) { this.d = 1; }
        if (this.in_abs_hit_ttl > 0) { return; }
        this.xaa = -.1;
        this.xa = 5;
        this.d = 1;
    };

    this.fire = () => {
        let b = this.gun.fire(this.x, this.y + 3, this.d);
        if (!b) { return; }

        this.bullets.add(b);
        this.xaa = this.d * .1;
        this.xa = -this.d * 3;
    };

    this.check_hit = (target) => {
        this.bullets.for_each((e) => {
            if (e.check_crash(target.x, target.y, pw, ph)) {
                target.been_hit(e);
                e.done = true;
                return 'break';
            }
        });
    };

    this.been_hit = (bullet) => {
        this.xaa = -bullet.d * .1;
        this.xa += bullet.d * bullet.hit;
        this.in_abs_hit_ttl = bullet.abs_hit;
        this.blood -= bullet.damage;
    };

    this.alive = () => {
        if (this.blood <= 0 || this.y > board_width + 100) { return false; }
        return true;
    };

    this.down = () => {
        this.y += ph + 1;
    };

    this.collect_crate = () => {
        crates.for_each((e) => {
            if (e.check_crash({
                x: this.x,
                y: this.y,
                xl: pw,
                yl: ph,
                xa: this.xa,
                ya: this.ya,
            })) {
                this.gun = e.been_collect();
            }
        });
    };

    this.killed = () => {
        return this.life <= 0;
    };

    this.draw_info = () => {
        ctx.fillStyle = COLORS.black;
        ctx.font = "10px 'Fira Code', consolas, monospace";
        ctx.fillText(dp_config.player_name + ':', dp_config.x, dp_config.y);
        draw_process_bar(dp_config.x + 60, dp_config.y - 13, this.blood, color);

        const rbi = this.gun.bullet_count();
        draw_process_bar(dp_config.x + 60, dp_config.y + 13, rbi.rest * 100 / rbi.full, color, rbi.rest.toString());

        if (this.life <= 3) {
            ctx.fillStyle = COLORS.red + 'DF';
            for (let i = 0; i < this.life; i += 1) {
                ctx.beginPath();
                ctx.arc(dp_config.x + 7 + 20 * i, dp_config.y + 20, 7, 0, 2 * Math.PI);
                ctx.fill();
            }

            ctx.fillStyle = COLORS.grey + 'DF';
            for (let i = this.life; i < 3; i += 1) {
                ctx.beginPath();
                ctx.arc(dp_config.x + 7 + 20 * i, dp_config.y + 20, 7, 0, 2 * Math.PI);
                ctx.fill();
            }
        }

        ctx.fillStyle = COLORS.blue;
        ctx.fillText(this.gun.name, dp_config.x + 480, dp_config.y + 26);
    }
}

function Rifle() {
    this.name = "Rifle";
    this.rest_bullet = 25;
    this.fetch_bullet_time = 300;

    this.can_multi_fire = () => false;

    this.fire = (x, y, d) => {
        if (!this.can_fire()) { return; }
        this.rest_bullet -= 1;
        return new Bullet({
            x: x,
            y: y,
            d: d,
        });
    };

    this.can_fire = () => {
        return this.rest_bullet > 0;
    };

    this.update = () => {
        if (this.rest_bullet == 0) { this.fetch_bullet_time -= 1; }
        if (this.fetch_bullet_time == 0) {
            this.rest_bullet = 25;
            this.fetch_bullet_time = 500;
        }
        return false;
    };

    this.bullet_count = () => {
        return {
            rest: this.rest_bullet,
            full: 25,
        }
    };
}

function SniperRifle() {
    this.name = "Sniper Rifle";
    this.rest_bullet = 5;
    this.next_fire = 30;

    this.can_multi_fire = () => false;

    this.can_fire = () => {
        return this.next_fire <= 0;
    };

    this.update = () => {
        if (this.rest_bullet <= 0) { return true; }
        this.next_fire -= 1;
        return false;
    };

    this.fire = (x, y, d) => {
        if (!this.can_fire()) { return; }
        this.next_fire = 50;
        this.rest_bullet -= 1;
        return new Bullet({
            x: x,
            y: y,
            d: d,
            w: 0,
            damage: 15,
            len: 30,
            hit: 30,
            speed: 75,
            abs_hit: 60,
        });
    };

    this.draw = (player) => {
        if (!this.can_fire()) { return; }
        ctx.fillStyle = COLORS.grey;
        ctx.fillRect(player.x, player.y, player.d * board_width, 1);
    };

    this.bullet_count = () => {
        let rest;
        if (this.can_fire()) { rest = 1; }
        else { rest = 0; }
        return {
            rest: rest,
            full: 1,
        };
    };
}

function SubmachineGun() {
    this.name = " Sub Machine Gun";
    this.rest_bullet = 120;

    this.can_multi_fire = () => clock % 4 == 0;

    this.fire = (x, y, d) => {
        if (!this.can_fire()) { return; }
        this.rest_bullet -= 1;
        return new Bullet({
            x: x,
            y: y,
            d: d,
            hit: 10,
            speed: 20,
            len: 15,
            w: 1,
            abs_hit: 3,
        });
    };

    this.can_fire = () => {
        return this.rest_bullet > 0;
    };

    this.update = () => {
        return !this.can_fire();
    };

    this.bullet_count = () => {
        return {
            rest: this.rest_bullet,
            full: 120,
        };
    };
}

function AK47Gun() {
    this.name = "AK-47";
    this.rest_bullet = 35;

    this.can_multi_fire = () => clock % 5 == 0;

    this.fire = (x, y, d) => {
        if (!this.can_fire()) { return; }
        this.rest_bullet -= 1;
        return new Bullet({
            x: x,
            y: y,
            d: d,
            hit: 10,
            speed: 20,
            len: 15,
            w: 0.7,
            abs_hit: 4,
        });
    };

    this.can_fire = () => {
        return this.rest_bullet > 0;
    };

    this.update = () => {
        return !this.can_fire();
    };

    this.bullet_count = () => {
        return {
            rest: this.rest_bullet,
            full: 35,
        };
    };
}

function MachineGun() {
    this.name = "Machine Gun";
    this.rest_bullet = 100;
    this.fetch_bullet_time = 400;
    this.refetch_time = 1;

    this.can_multi_fire = () => clock % 3 == 0;

    this.fire = (x, y, d) => {
        if (!this.can_fire()) { return; }
        this.rest_bullet -= 1;
        return new Bullet({
            x: x,
            y: y,
            d: d,
            hit: 8,
            speed: 20,
            len: 15,
            w: 1.2,
        });
    };

    this.can_fire = () => {
        return this.rest_bullet > 0;
    };

    this.update = () => {
        if (this.refetch_time <= 0) { return false; }
        if (this.fetch_bullet_time == 500 && this.rest_bullet == 0) {
            this.refetch_time -= 1;
        }
        if (this.rest_bullet == 0) { this.fetch_bullet_time -= 1; }
        if (this.fetch_bullet_time == 0) {
            this.rest_bullet = 100;
            this.fetch_bullet_time = 500;
        }
        return false;
    };

    this.bullet_count = () => {
        return {
            rest: this.rest_bullet,
            full: 100,
        };
    };
}

function ThrowKnife() {
    this.name = "Thrown Knife"
    this.rest_bullet = 5;

    this.can_multi_fire = () => false;

    this.fire = (x, y, d) => {
        if (!this.can_fire()) { return; }
        this.rest_bullet -= 1;
        return new Knife({
            x: x,
            y: y,
            d: d,
        });
    };

    this.can_fire = () => {
        return this.rest_bullet > 0;
    };

    this.update = () => {
        return !this.can_fire();
    };

    this.bullet_count = () => {
        return {
            rest: this.rest_bullet,
            full: 5,
        };
    };
}

function ExtendedThrowKnife() {
    this.name = "Ex Thrown Knife"
    this.rest_bullet = 20;

    this.can_multi_fire = () => clock % 10 == 0;

    this.fire = (x, y, d) => {
        if (!this.can_fire()) { return; }
        this.rest_bullet -= 1;
        return new Knife({
            x: x,
            y: y,
            d: d,
            damage: 5,
            hit: 20,
            abs_hit: 45,
        });
    };

    this.can_fire = () => {
        return this.rest_bullet > 0;
    };

    this.update = () => {
        return !this.can_fire();
    };

    this.bullet_count = () => {
        return {
            rest: this.rest_bullet,
            full: 20,
        };
    };
}

function PowerDefence() {
    this.name = "Power Defence"
    this.rest_bullet = 15;

    this.can_multi_fire = () => false;

    this.fire = (x, y, d) => {
        if (!this.can_fire()) { return; }
        this.rest_bullet -= 1;
        return new ShortAttack({
            x: x,
            y: y,
            d: d,
        });
    };

    this.can_fire = () => {
        return this.rest_bullet > 0;
    };

    this.update = () => {
        return !this.can_fire();
    };

    this.draw = (player) => {
        if (!this.can_fire()) { return; }
        ctx.fillStyle = COLORS.red;
        ctx.fillRect(player.x, player.y, player.d * 50, 1);
    };

    this.bullet_count = () => {
        return {
            rest: this.rest_bullet,
            full: 15,
        };
    };
}

function Bullet(config) {
    complete_with_default(config, {
        len: 10,
        damage: 2,
        w: 0.5,
        hit: 14,
        speed: 15,
        abs_hit: 4,
    });

    this.len = config.len;
    this.damage = config.damage;
    this.hit = config.hit;
    this.abs_hit = config.abs_hit;

    this.d = config.d;
    this.done = false;

    this.x = config.x;
    this.y = config.y;

    this.xa = config.d * config.speed;
    this.ya = random_positive_negative() * Math.random() * config.w;

    this.xaa = 0;
    this.yaa = 0.001 * config.w;

    this.update = () => {
        this.x += this.xa;
        this.y += this.ya;
        this.xa += this.xaa;
        this.ya += this.yaa;
    };

    this.draw = () => {
        ctx.fillStyle = COLORS.yellow;
        ctx.fillRect(this.x, this.y - 1, this.len, 3);
    };

    this.alive = () => {
        if (this.done || this.x < 0 || this.x > board_width) { return false; }
        return true;
    };

    this.check_crash = (x, y, xl, yl) => {
        return common_check_crash({
            x: this.x,
            y: this.y,
            xa: this.xa,
            ya: this.ya,
            xl: this.len,
        }, {
            x: x,
            y: y,
            xl: xl,
            yl: yl,
        });
    };
}

function Knife(config) {
    complete_with_default(config, {
        damage: 15,
        hit: 25,
        speed: 30,
        abs_hit: 60,
    });

    const size = 12;

    this.name = "Knife"
    this.damage = config.damage;
    this.hit = config.hit;
    this.abs_hit = config.abs_hit;

    this.d = config.d;
    this.done = false;

    this.x = config.x;
    this.y = config.y;

    this.xa = config.d * config.speed;
    this.ya = -20 * common_spd;

    this.xaa = 0;
    this.yaa = 0.5 * common_spd;

    this.update = () => {
        this.x += this.xa;
        this.y += this.ya;
        this.xa += this.xaa;
        this.ya += this.yaa;
    };

    this.draw = () => {
        ctx.fillStyle = COLORS.red;
        ctx.beginPath();
        ctx.arc(this.x - size / 2, this.y - size / 2, size / 2, 0, 2 * Math.PI);
        ctx.fill();
    };

    this.alive = () => {
        if (this.done || this.x < 0 || this.x > board_width) { return false; }
        return true;
    };

    this.check_crash = (x, y, xl, yl) => {
        return common_check_crash({
            x: this.x,
            y: this.y,
            xa: this.xa,
            ya: this.ya,
            xl: size,
            yl: size,
        }, {
            x: x,
            y: y,
            xl: xl,
            yl: yl,
        });
    };
}

function ShortAttack(config) {
    complete_with_default(config, {
        damage: 25,
        hit: 45,
        abs_hit: 60,
    });

    this.damage = config.damage;
    this.hit = config.hit;
    this.abs_hit = config.abs_hit;

    this.d = config.d;
    this.done = false;

    this.x = config.x;
    this.y = config.y;

    this.xa = config.d * 25;
    this.ya = 0;
    this.ttl = 2;

    this.xaa = 0;
    this.yaa = 0;

    this.update = () => {
        this.ttl -= 1;
        this.x += this.xa;
        this.y += this.ya;
        this.xa += this.xaa;
        this.ya += this.yaa;
    };

    this.draw = () => { };

    this.alive = () => {
        if (this.ttl <= 0 || this.done || this.x < 0 || this.x > board_width) { return false; }
        return true;
    };

    this.check_crash = (x, y, xl, yl) => {
        return common_check_crash({
            x: this.x,
            y: this.y,
            xa: this.xa,
            ya: this.ya,
        }, {
            x: x,
            y: y,
            xl: xl,
            yl: yl,
        });
    };
}

function Land(x, y, l) {
    this.x = x || Math.random() * board_width;
    this.y = y || Math.random() * board_height;
    this.len = l || 200;

    this.check_crash = (x, y, h) => {
        return common_check_crash({
            x: this.x,
            y: this.y,
            xl: this.len,
        }, {
            x: x,
            y: y,
            yl: h,
        });
    };

    this.draw = () => {
        ctx.fillStyle = COLORS.black;
        ctx.fillRect(this.x, this.y, this.len, 2);
    };
}

function YMoveLand(x, y, l, ttl) {
    this.x = x || Math.random() * board_width;
    this.y = y || Math.random() * board_height;
    this.len = l || 200;
    this.speed = 2;
    this.d_ttl = ttl || 100;
    this.d = -1;

    this.update = () => {
        this.y += this.d * this.speed;
        this.d_ttl -= 1;
        if (this.d_ttl <= 0) {
            this.d_ttl = ttl;
            this.d = -this.d;
        }
    };

    this.check_crash = (x, y, h) => {
        return common_check_crash({
            x: this.x,
            y: this.y,
            xl: this.len,
            ya: this.d * this.speed,
        }, {
            x: x,
            y: y,
            yl: h,
        });
    };

    this.draw = () => {
        this.update();
        ctx.fillStyle = COLORS.black;
        ctx.fillRect(this.x, this.y, this.len, 2);
    };
}

function LandScape() {
    this.lands = new Array();

    let maps = [function (a) {
        a.push(new Land(150, 150, 300));
        a.push(new Land(700, 150, 300));
        a.push(new Land(350, 500, 300));
        a.push(new Land(300, 300, 300));
        a.push(new Land(200, 550, 300));
        a.push(new Land(800, 600, 500));
    }, function (a) {
        a.push(new Land(150, 150, 500));
        a.push(new Land(450, 250, 400));
        a.push(new Land(550, 350, 400));
        a.push(new Land(750, 450, 400));
        a.push(new Land(950, 600, 400));
        a.push(new YMoveLand(100, 700, 150, 200));
    }, function (a) {
        a.push(new Land(50, 750, board_width - 50));
        a.push(new Land(1100, 650, 300));
        a.push(new Land(1100, 550, 300));
        a.push(new Land(1100, 450, 300));
        a.push(new Land(1100, 350, 300));
        a.push(new Land(1100, 250, 300));
        a.push(new Land(1100, 150, 300));

        a.push(new Land(100, 650, 300));
        a.push(new Land(100, 550, 300));
        a.push(new Land(100, 450, 300));
        a.push(new Land(100, 350, 300));
        a.push(new Land(100, 250, 300));
        a.push(new Land(100, 150, 300));

        a.push(new YMoveLand(600, 700, 150, 300));
    }, function (a) {
        a.push(new Land(board_width / 4, board_height / 2, board_width / 2));
    }, function (a) {
        a.push(new Land(200, 250, 300));
        a.push(new Land(700, 250, 500));
        a.push(new Land(300, 400, 300));
        a.push(new Land(670, 400, 130));
        a.push(new Land(900, 400, 500));
        a.push(new Land(470, 600, 130));
        a.push(new Land(100, 600, 350));
        a.push(new Land(730, 600, 600));
    }, function (a) {
        a.push(new Land(50, 110, 150));
        a.push(new Land(board_width - 250, 130, 200));
        a.push(new Land(250, 260, 200));
        a.push(new Land(750, 260, 220));
        a.push(new Land(400, 360, 350));
        a.push(new Land(950, 460, 350));
        a.push(new YMoveLand(100, 660, 150, 100));
    }];

    this.make = (c) => {
        maps[Math.round(Math.random() * (maps.length - 1))](this.lands);
        this.lands.sort((x, y) => { return y.y - x.y; });
    };

    this.draw = () => {
        for (let i in this.lands) {
            this.lands[i].draw();
        }
    };

    this.at = (i) => this.lands[i];

    this.random = () => {
        return this.lands[Math.round(Math.random() * (this.lands.length - 1))];
    };
}

function Crate(x, y) {
    this.done = false;
    this.ttl = 400;

    this.xl = 20;
    this.yl = 20;

    let rland = lands.random();
    this.x = x || rland.x + rland.len * Math.random();
    this.y = y || rland.y - this.yl;

    this.check_crash = (target) => {
        return common_check_crash({
            x: this.x,
            y: this.y,
            xl: this.xl,
            yl: this.yl,
        }, target);
    };

    this.update = () => {
        this.ttl -= 1;
    };

    this.alive = () => {
        return !this.done && this.ttl > 0;
    };

    this.draw = () => {
        ctx.fillStyle = COLORS.yellow;
        ctx.fillRect(this.x, this.y, this.xl, this.yl);
    };

    this.been_collect = () => {
        this.done = true;
        let tools = [SubmachineGun, MachineGun, SniperRifle, PowerDefence, ThrowKnife, ThrowKnife, ExtendedThrowKnife, AK47Gun, AK47Gun, AK47Gun, AK47Gun, AK47Gun];
        let rtool = tools[Math.round(Math.random() * (tools.length - 1))]
        return new rtool();
    };
}

function init() {
    ctx = document.getElementById('board').getContext('2d');

    playerA = new Player({
        key_fire: 'KeyG',
        key_left: 'KeyA',
        key_right: 'KeyD',
        key_up: 'KeyW',
        key_down: 'KeyS',
    }, COLORS.green, {
        x: 50,
        y: 20,
        player_name: 'Player A'
    });

    playerB = new Player({
        key_fire: 'KeyM',
        key_left: 'ArrowLeft',
        key_right: 'ArrowRight',
        key_up: 'ArrowUp',
        key_down: 'ArrowDown',
    }, COLORS.purple, {
        x: 850,
        y: 20,
        player_name: 'Player B'
    });

    requestAnimationFrame(update);

    setInterval(function () {
        document.getElementById('fps').innerHTML = to_trio_str(clock - lst_clock) + "<br>FPS";
        lst_clock = clock;
    }, 1000);
}

function update() {
    clock += 1;
    ctx.clearRect(0, 0, board_width, board_height);

    playerA.check_hit(playerB);
    playerB.check_hit(playerA);

    playerA.update();
    playerB.update();

    if (playerA.killed()) { alert('PlayerB Wins!\nRefresh to start again.'); return; }
    if (playerB.killed()) { alert('PlayerA Wins!\nRefresh to start again.'); return; }
    lands.draw();

    if (clock % 200 == 0) {
        crates.add(new Crate());
    }

    crates.update((e) => {
        e.update();
        e.draw();
    });

    requestAnimationFrame(update);
}

window.onload = init;
