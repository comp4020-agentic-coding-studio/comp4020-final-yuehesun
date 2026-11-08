# What I built

**Laundry Queue** is a shared queue for a student residence's laundry
machines — see [`README.md`](README.md) for the "good" argument and
[`plan.md`](plan.md#user-story) for the user story it's built from.
Crit 8 shipped a working, persistent app with one machine type; crit 9
added real-time sync; crit 10 added logging, then an extension making
the fairness rules checkable at real scale with seeded scenarios, not
just argued in words. A later addition, prompted by course feedback,
added a first-person 3D walkthrough with real, scannable per-machine QR
codes.

# Process overview

第一步是确定选题和设计计划。the agent first suggested three generic ideas and
a co-op-game direction, all rejected
([`25bf1ab`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/25bf1ab))
. 最红我从自身现实生活中的痛点入手，试图解决宿舍洗衣房排队浪费时间的问题，选择了 The laundry queue作为主题。起初Agent也没有写出一份令人满意的计划，直到我自己梳理出实际场景，一步步向它解释，方案才逐渐符合我的预期
([`1323937`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/1323937),
`docs/adr/0001-app-concept.md`). 工作过程中，我逐渐明确了自己和 Agent 的分工：已经确定的决策，可以交给 Agent 去实现和论证；但要解决什么问题，以及最终要把应用做成什么样，仍然由我来决定。

在building过程中我尝试了多种agent管理方法。比如CLAUDE.md中的workflow，把总plan拆为小stage，每个stage循环都从planning开始，并且必须人工test后才能结束。再比如无人值守的尝试。在tutorial riff 中体验后，自己也试着给 crit 10's
extension 写了一份支持它工作2小时的`prompt.md`。我wrote every decision down first — identity, the harness, in-page alerts, no separate board — into ADRs
and 用 an "Unattended runs" section in `CLAUDE.md` 启动了无人值守,让claude verify its own work with
specs and screenshots
([`95bc7e7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/95bc7e7),
[`f2b0b59`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/f2b0b59)).
It produced a home page that actually looked considered
([`8402c26`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8402c26)),
cheaper than my usual back-and-forth.

在这次经验后，我又用无人值守做了simulation页——这是我前期实况模拟的一个重要尝试。Crit 9 replaced "miss your window, get ejected" with "move
back one place," 这个决定的理由记录在 `docs/adr/0005` 中，但那只是理论推导。我想测试实际使用情况，但我不可能真的把系统接上洗衣机，于是我想到了用种子数据模拟真实的使用规模——一个有 100 名居民、持续一整天的场景。That's what `/simulation` is — a 动画 to watch the result of 三种不同排队策略 at real scale.([`f2b0b59`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/f2b0b59))。Running the
simulation's full batch hung my machine, twice。Agent 最初认为问题出在它自己的后台任务处理机制上。但我没有直接相信它的判断，而是换到另一个 terminal，在完全不涉及 Agent 的情况下独立运行模拟脚本。结果依然发生了同样的崩溃。这排除了 Agent 后台进程的问题，也让我把注意力转向模拟脚本本身。最终发现，问题在于脚本运行 150 个 seeds 的过程中，从未主动让出控制权，导致程序一直占用执行资源。我通过人工测试debug，最终成功实现了这个模拟([`2e1f913`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/2e1f913))。不过这个阶段的模拟测试还是停留在数据层面，I'd always felt the project never connected to a
real use case。


不久后，A tutor reviewing the deployed app 提出了一个问题：仅仅展示模拟结果，可能还不足以说服宿舍管理者真正采用这个系统。他建议构建一个 3D walkthrough 洗衣房，让user直接扫描虚拟洗衣机上的真实二维码,直接进入自己的homepage。这是一个我未曾设想过的角度，我觉得非常有意思，马上开始尝试搭建。但一个很酷的想法想要落地往往不那么容易，细节上的问题层出不穷。When Building the 3D room, I found the character standing still while the
agent's checks called it working as intended. I didn't accept the agent's first explanation, and had it swap in a
simpler, bone-free placeholder instead — if that moved and the real
one didn't, the bug was specific to the rigged model. It moved,
narrowing the cause to the model-copying code sharing one skeleton
across every clone, so the bones never tracked a position variable
that had been correct all along
([`8e33e09`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/8e33e09)).
A later camera bug 有些类似 — a "fix" whose symptom
proved unchanged the moment I tried it, resolved only once I insisted
on a full re-check, not another tuning pass
([`935bad5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-yuehesun/commit/935bad5)).
A clean-looking check was never proof; re-testing the symptom caught
an incomplete fix each time.
 
经过多日尝试，我终于成功线上部署了3d漫游洗衣房（哈希链接）The room later gained a way to see other residents' characters walking
around it too — a small multiplayer-style addition answering the
project's multi-user and real-time requirements a second way
([`docs/adr/0014-laundry-presence.md`](docs/adr/0014-laundry-presence.md)).

由于对洗衣房物理布局进行了建模，另一个功能也有了实现基础——Letting the next person move a previous resident's uncollected laundry
to a drop-pff区。 这同样是我想自己遇到的、想要解决的痛点，and I'd imagined it as simple. 
但当我开始实现 3D 场景中的「拿起衣物、搬运、放置」这一完整动作时，才发现服务端根本没有与之对应的中间状态。

数据库在衣物被拿起的瞬间，就已经将整个交接操作记录为完成。因此，当 3D 场景仍然显示衣物正在被搬运时，服务端的数据却会不断覆盖场景中的状态。

要让这个交互真正正常工作，就必须在拿起和放置之间增加一个 in-transit 状态。同时，我还需要明确谁有权搬运衣物、如何完成置物架放置，以及什么时候通知原来的物主
([`docs/adr/0013-laundry-handoff-authorization.md`](docs/adr/0013-laundry-handoff-authorization.md)).
A good idea on paper still needed building to find what it missed.因此理解用户需求和真正实现一个可用的交互之间，仍然存在很大的距离。

The last real fork overruled a rejection that read as well-argued. The
home page's "Claim" button let anyone claim with no scan involved — 这是早期还没有 real QR code 时候选择一个省事的方法.。但既然现在有了3d洗衣房，我就想尽可能复原现实中认领洗衣机的方式。然而，当我让agent评估
"should claiming require a scan" 时，它concluded no: it would narrow "a phone
alone is enough," and tests would
behave differently from production. [`0015`](docs/adr/0015-scan-gated-claim.md)I pushed back: 如果不强制扫码证明到场，那么有人完全可以躺在房间里直接领取洗衣机，但却没有真正开始洗衣服，浪费后面人的时间。这恰恰是系统原本希望避免的不公平行为。
我也进一步检查了这个修改是否真的会破坏原有设计，而实际代码表明： `claim()` never verified arrival, an
unverified scan does the same work an unverified room number does for
identity, and every spec already calls `join()` before `claim()`, so
teaching them to scan first added one precondition without forking
anything. [`docs/adr/0016`](docs/adr/0016-scan-gated-claim-accepted.md) .最终此功能成功实现。

从上述过程可以看出。Automated checks (`pnpm check`) confirm the app builds and invariants
hold. They can't judge whether a decision honors the project's own
argument, or a rejection's premises are true — that judgment happened
by hand, logged in `process-notes.md`, the most load-bearing moments
promoted here.


