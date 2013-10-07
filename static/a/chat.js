
// --- chat

function Chat(options)
{
  this.messageList    = typeof options.messageList == 'string' ? $(options.messageList) : options.messageList;
  this.messageBox     = typeof options.messageBox == 'string' ? $(options.messageBox) : options.messageBox;
  this.submitButton   = typeof options.submitButton == 'string' ? $(options.submitButton) : options.submitButton;
  this.hotkeyMod      = typeof options.hotkeyMod == 'string' ? $(options.hotkeyMod) : options.hotkeyMod;
  this.userPanel      = typeof options.userPanel == 'string' ? $(options.userPanel) : options.userPanel;
  this.nicknameBox    = typeof options.nicknameBox == 'string' ? $(options.nicknameBox) : options.nicknameBox;
  this.userJoinButton = typeof options.userJoinButton == 'string' ? $(options.userJoinButton) : options.userJoinButton;

  // websockets
  this.socket = options.transport;

  // --- limits
  this.maxMessages = options.maxMessages || 150;

  // --- d3

  // the lib
  this.d3 = options.d3;
  // container
  this._container = this.d3.select(this.messageList[0]);
  // drawing function
  this._drawMessage = $.partial(this._drawMessageStub, this);

  // messages storage
  this.messages = [];

  // init
  this.init();
}

Chat.prototype.init = function Chat_init()
{
  var _chat = this
    , message
    ;

  // connect to the server
  this.socket.on('open', function primus_onOpen()
  {
    // say hello
    _chat.socket.write({ helo: 'chat' });
  });

  // check the user
  this.socket.on('data', function primus_onData(data)
  {
    // [chat] welcome message
    if (data['chat'])
    {
      // if current instance is out of date
      // reset it
      if (_chat.instance() != data.chat.instance)
      {
        _chat.instance(data.chat.instance);
        _chat.user(false);
      }

      // check for user
      if (!_chat.user())
      {
        _chat._toggleUserPanel();
      }
      else // try to login
      {
        _chat.socket.write({ 'chat:login': _chat.user() });
      }

      _chat.setMessages(data.chat.messages);
    }

    // [chat:error]
    if (data['chat:error'])
    {
      _chat.addSystemMessage('Error: '+data['chat:error'].err.message+'.', 'error');

      switch (data['chat:error'].from)
      {
        // handle login errors
        case 'login':
          _chat.user(false);
          _chat._toggleUserPanel();
          break;
      }
    }

    // [chat:logged]
    if (data['chat:logged'])
    {
      _chat._logged(data['chat:logged']);
    }

    // [chat:user]
    if (data['chat:user'])
    {
      _chat.addSystemMessage('User '+data['chat:user'].nickname+' has joined.');
    }

    // [chat:left]
    if (data['chat:left'])
    {
      _chat.addSystemMessage('User '+data['chat:left'].nickname+' has left.');
    }

    // [chat:message]
    if (data['chat:message'])
    {
      _chat.addMessage(data['chat:message']);
    }

  });

  // spawn event listneres

  this._addTextboxShortcut();

}

// --- getters/setters

Chat.prototype.user = function Chat_user(value)
{
  if (arguments.length > 0)
  {
    $.cookie('chat:user', value, {months: 1});
  }

  return $.cookie('chat:user');
}

Chat.prototype.instance = function Chat_instance(value)
{
  if (arguments.length > 0)
  {
    $.cookie('chat:instance', value, {months: 1});
  }

  return $.cookie('chat:instance');
}

// --- more meaningful methods

Chat.prototype.join = function Chat_join(user)
{
  this.socket.write({ 'chat:join': {nickname: user} });
}

Chat.prototype.submit = function Chat_submit(message, callback)
{
  this.socket.write({'chat:message': message});
  // do shortcut
  callback(null);
}

Chat.prototype.addMessage = function Chat_addMessage(message)
{
  this.messages.push(message);

  if (this.messages.length > this.maxMessages)
  {
    this.messages = this.messages.slice(this.maxMessages * -1);
  }

  this._renderMessages();
}

Chat.prototype.setMessages = function Chat_setMessages(messages)
{
  this.messages = messages;
  this._renderMessages();
}

Chat.prototype.addSystemMessage = function Chat_addSystemMessage(text, type)
{
  this.messages.push(
  {
    id  : Date.now(),
    time: Date.now(),
    text: text,
    type: type || 'status'
  });
  this._renderMessages();
}

// --- demi-private methods

// handle logged event
Chat.prototype._logged = function Chat__logged(user)
{
  this.user(user);
  this._toggleUserPanel(false);
}

// adds platform specific shortcut to the textbox (mac: Cmd+Enter or otherwise:Ctrl+Enter)
Chat.prototype._addTextboxShortcut = function Chat__addTextboxShortcut()
{
  var _chat = this;

  // wait for Ctrl\Cmd+Enter to submit
  this.messageBox.on('keydown', function(e)
  {
    var _messageBox = this;
    if ( e.which == 13 && !e.altKey && (message = this.value.trim()) )
    {
      e.preventDefault();
      _chat.submit(message, function(err)
      {
        if (err) return alert(err);

        _messageBox.value = '';
      });
      return false;
    }
  });

  // click on the submit button
  this.submitButton.on('click', function(e)
  {
    var message;

    e.preventDefault();

    if (message = _chat.messageBox.val().trim())
    {
      _chat.submit(message, function(err)
      {
        if (err) return alert(err);
        _chat.messageBox.val('');
      });
      return false;
    }
  });
}

// toggles user panel on/off
// on by default
Chat.prototype._toggleUserPanel = function Chat__toggleUserPanel(show)
{
  var _chat = this;

  if (arguments.length < 1)
  {
    show = true;
  }

  if (show)
  {
    this.userPanel.removeAttr('hidden');

    // add event listeners

    // enter in the input field
    this.nicknameBox.on('keydown', function(e)
    {
      var nickname;
      if ( e.which == 13 && (nickname = this.value.trim()) )
      {
        e.preventDefault();
        _chat.join(nickname);
        return false;
      }
    });

    // click on the join button
    this.userJoinButton.on('click', function(e)
    {
      var nickname;

      e.preventDefault();

      if (nickname = _chat.nicknameBox.val().trim())
      {
        _chat.join(nickname);
        return false;
      }
    });
  }
  else
  {
    this.userPanel.attr('hidden', true);

    // remove event listeners
    this.nicknameBox.off();
    this.userJoinButton.off();
  }
}

Chat.prototype._userNicknameHandle = function Chat__userNicknameHandle()
{
  if (arguments.length < 1)
  {
    show = true;
  }

  if (show)
  {
    this.userPanel.removeAttr('hidden');
  }
  else
  {
    this.userPanel.attr('hidden', true);
  }
}

Chat.prototype._renderMessages = function Chat__renderMessages()
{
  var item;

  // reset last item
  this._lastDrawnUser = undefined;

  item = this._container.selectAll('.chat_message')
    .data(this.messages, function(d){ return d.id; })
    .order()
    .each(this._drawMessage)
    ;

  item.enter().append('div')
    .order()
    .each(this._drawMessage)
    ;

  item.exit()
    .remove()
    ;

  // scroll to the last message
  setTimeout(function()
  {
    document.body.scrollTop = 1;
    document.body.scrollTop = document.body.scrollHeight;
  }, 300);

}

Chat.prototype._drawMessageStub = function Chat__drawMessageStub(_chat, d)
{
  // this here is a DOM element
  var el   = _chat.d3.select(this)
    , isMe = (_chat.user() && d.user == _chat.user().nickname)
    , html
    , match
    ;

  if (d.type == 'status')
  {
    d.text = _chat._replaceUserName(d.text);
  }

  html = '<span class="chat_message_text">'+d.text+'</span>';

  if (d.user && _chat._lastDrawnUser != d.user)
  {
    _chat._lastDrawnUser = d.user;
    html = '<span class="chat_message_user">'+(isMe ? 'me' : _chat._translateUser(d.user))+'</span>' + html;
  }
  else if (!d.user) // system message
  {
    // reset last item
    _chat._lastDrawnUser = undefined;
  }

  el
    .classed('chat_message', true)
    .classed('chat_message_'+d.type, !!d.type)
    .classed('chat_message_mine', isMe)
    .attr('id', 'chat_message_'+d.id)
    .html(html);
}

Chat.prototype._replaceUserName = function Chat__replaceUserName(str)
{
  var _chat = this;

  str = str.replace(/User (\b[\w_]+\b)/, function(match, name)
  {
    return _chat._translateUser(name);
  });

  return str;
}

Chat.prototype._translateUser = function Chat__translateUser(name)
{
  var match;

  if (name == '_admin_admin')
  {
    name = 'Game Host';
  }
  else if (match = name.match(/^_team_([\w_]+)$/))
  {
    name = 'Team '+match[1];
  }

  return name;
}
