
import nameLine from './components/nameLine.pug'
import boardTemplate from './components/board.pug'
import winnerModal from './components/winnerModal.pug'

import isEqual from 'lodash/isEqual'
import ReactiveStore from '../../reactivestore.js'

localStorage.debug = ''

let storage = sessionStorage
let local = JSON.parse(storage.getItem('local')) || {}

$( document ).ready(function() {

  const storeInfos = infos => {
    Object.keys(infos).map(key => local[key] = infos[key])
    storage.setItem('local', JSON.stringify(local))
  }

  const clearInfos = () => {
    local = {}
    storage.setItem('local', {})
  }

  let buffer = {}
  $.extend(true, buffer, local)
  const socket = io()
  const currentId = location.href.split('/').reverse()[0]

  if (local.id !== currentId) {
    console.log('Diffrent ID')
    clearInfos()
    storeInfos({ store: {}, id: currentId })
  } else {
    console.log('Same ID')
    if (local.store.user.socketId) {
      console.log('==> userReconnect', local.store.user.socketId)
      socket.emit('userReconnect', local.store.user.socketId)
    }
  }

  const store = new ReactiveStore({
    socket,
    store: local.store,
    updateHandler: (store, dataName) => {
      console.log(`<== ${dataName} updated: `, store[dataName])
      storeInfos({ store })
    }
  })

  store.bind({
    users: {
      event: 'usersUpdate',
      default: []
    },
    user: {
      event: 'userUpdate',
      default: {}
    },
    cards: {
      event: 'cardsUpdate',
      default: []
    },
    ready: {
      event: 'readyUpdate',
      default: []
    },
    turn: {
      event: 'turnUpdate',
      default: {}
    },
    winner: {
      event: 'winnerUpdate',
      default: ''
    },
    teams: {
      event: 'teamsUpdate',
      default: []
    },
    playing: {
      event: 'playingUpdate',
      default: false
    }
  })

  storeInfos({ store: store.getStore() })
  console.log('Stored store', store.getStore())

  const nextTeam = (team) => {
    return team === 'blue' ? 'orange' : 'blue'
  }

  const getJoinHandler = prefix => () => {
    const name = $(`#${prefix}NameInput`).val()
    const team = prefix === 'blue' ? 'blue' : 'orange'
    $('.nameInputWrapper').hide()
    const user = { name, socketId: socket.id, team }
    console.log('==> userConnect', user)
    socket.emit('userConnect', user)
  }

  const validOnEnterPressed = prefix => key => {
    if(key.which === 13)
      $(`#${prefix}Join`).click()
  }

  store.connect(['playing'], ({ store }) => {
    $('#actionButton').off('click')
    if(store.playing) {
      $('.team-ready').hide()
      $('#actionButton').html('End turn')
      $('#actionButton').click(() => {
        console.log('==> userEndTurn')
        socket.emit('userEndTurn')
      })
    } else {
      $('#actionButton').html('Ready')
      $('#actionButton').click(() => {
        console.log('==> userReady')
        socket.emit('userReady')
      })
    }
  })

  store.connect(['ready'], ({ store }) => {
    // Add ready icon
    $('.team-ready').hide()
    store.ready.map(team => {
      $(`#${team}Ready`).show()
    })
    if (!store.ready.includes(store.user.team)) {
      $('#action > button').prop('disabled', false)
    } else {
      $('#action > button').prop('disabled', true)
    }
  })

  store.connect(['turn'], ({ store }) => {
    if(!store.playing) {
      return
    }
    const updateTurn = (turn) => () => {
      $(`.${turn}Turn`).show()
      $(`.${nextTeam(turn)}Turn`).hide()
    }
    setTimeout(updateTurn(store.turn.turn), store.turn.delay)
    if (store.turn.turn === store.user.team) {
      $('#action > button').prop('disabled', false)
      if (!store.user.isCaptain) {
        $('.game-card').css('cursor', 'pointer')
      }
    } else {
      $('#action > button').prop('disabled', true)
      $('.game-card').css('cursor', 'default')
    }
  })

  store.connect(['winner'], ({ store }) => {
    if(store.winner) {
      $('#winnerModal').append(winnerModal({team: store.user.team, isWinner: store.winner === store.user.team }))
      $('#winnerModal > .modal').modal('show')
      $('.turnSelector').hide()
    }
  })

  store.connect(['cards'], ({ store, prev }) => {
    $('#board').empty().append(boardTemplate({ cards: store.cards, isCaptain: store.user.isCaptain })).show()
    if (!store.user.isCaptain) {
      $('.game-card').click(function(){
        console.log('==> userChooseCard', $(this).children().html())
        socket.emit('userChooseCard', $(this).children().html())
      })
    }

    if (prev.cards.length > 0) {
      prev.cards.map((row, i) => {
        row.map((card, j) => {
          if (!card.isRevealed && store.cards[i][j].isRevealed) {
            $(`#word-${card.word.fr.replace(/ /g, '')}`)
              .animate({'opacity': '0'}, 500, () => {
                $(`#word-${card.word.fr.replace(/ /g, '')}`)
                  .addClass('revealed')
                $(`#word-${card.word.fr.replace(/ /g, '')}`)
                  .css({'background-color': '', 'color': ''})
                $(`#word-${card.word.fr.replace(/ /g, '')}`)
                  .animate({'opacity': '1'}, 500)
              })
          } else if(store.cards[i][j].isRevealed) {
            $(`#word-${card.word.fr.replace(/ /g, '')}`).addClass('revealed')
          }
        })
      })
    } else {
      store.cards.map((row, i) => {
        row.map((card, j) => {
          if(store.cards[i][j].isRevealed) {
            $(`#word-${card.word.fr.replace(/ /g, '')}`).addClass('revealed')
          }
        })
      })
    }

    if (store.turn.turn === store.user.team) {
      $('#action > button').prop('disabled', false)
      if (!store.user.isCaptain) {
        $('.game-card').css('cursor', 'pointer')
      }
    } else {
      $('#action > button').prop('disabled', true)
      $('.game-card').css('cursor', 'default')
    }
  })


  // Update user list
  store.connect(['users'], ({ store }) => {
    $('#blueTeam').empty()
    $('#orangeTeam').empty()
    store.users.map(user => {
      const userLine = nameLine({
        name: user.name,
        me: user.socketId === store.user.socketId,
        isOnline: user.isOnline,
        isCaptain: user.isCaptain
      })
      $(`#${user.team}Team`).append(userLine)
    })
  })

  // Update selected card color
  store.connect(['user'], ({ prev, store }) => {
    let toto = {}
    $.extend(true, toto, store)
    if(store.user.isCaptain) {
      $('#action').show()
    } else {
      $('#action').hide()
    }
    if(!store.user.name) {
      $('.nameInputWrapper').show()
    } else {
      $('.nameInputWrapper').hide()
    }

    const prevChoosedCard = prev.user.choosedCard || {}
    const choosedCard = store.user.choosedCard || {}
    if (!isEqual(prevChoosedCard, choosedCard)) {
      const prevWord = prevChoosedCard.word || {}
      const newWord = choosedCard.word || {}
      $(`#word-${prevWord.fr}`).css({'background-color': '', 'color': ''})
      $(`#word-${newWord.fr}`).css({'background-color': '#55efc4', 'color': 'white'})
    }
  })

  // Display inputs to join teams
  $('#blueJoin').click(getJoinHandler('blue'))
  $('#blueNameInput').keypress(validOnEnterPressed('blue'))

  $('#orangeJoin').click(getJoinHandler('orange'))
  $('#orangeNameInput').keypress(validOnEnterPressed('orange'))
})


